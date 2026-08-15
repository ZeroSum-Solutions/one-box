/**
 * Refero MCP client — the style-research engine this whole prototype is
 * proving out (plan §What this proves). Streamable-HTTP client to
 * api.refero.design/mcp, authenticated with persistent browser OAuth. A static
 * REFERO_MCP_TOKEN remains available only as a legacy non-interactive fallback.
 *
 * Singleton on globalThis (Prisma pattern) so Next.js HMR reconnects reuse
 * one session instead of leaking a new one per reload — the budget is a
 * hard 8k calls/mo on the Pro plan, tracked via referoCallCount().
 *
 * Tool names are confirmed against vendor/refero_skill's own docs
 * (refero_search_styles, refero_get_style, refero_search_screens,
 * refero_get_screen, refero_get_screen_image) but still resolved through a
 * live tools/list call before first use, per "MCP clients may namespace
 * tool names" in that same doc — never hardcode past the server's own
 * advertised list.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  PersistentReferoOAuthProvider,
  referoCallbackUrl,
  referoFetch,
  referoOAuthStorePath,
} from "../referoAuth";
import {
  ReferoLedgerUnavailableError,
  reserveReferoCall,
} from "./referoBudget";

const REFERO_MCP_URL = "https://api.refero.design/mcp";

// ---------- content + normalized record shapes ----------

interface TextBlock {
  type: "text";
  text: string;
}
interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
}
type ContentBlock = TextBlock | ImageBlock | { type: string; [k: string]: unknown };

export interface StyleSummary {
  id: string;
  name: string;
  summary: string;
  sourceUrl?: string;
  previewImageUrl?: string;
  platform?: string;
}

export interface ScreenSummary {
  id: string;
  name: string;
  summary: string;
  platform?: string;
  appName?: string;
}

// ---------- globalThis singleton (HMR-safe) ----------

interface ReferoClientState {
  client: Client;
  transport: StreamableHTTPClientTransport;
  connecting: Promise<void> | null;
  toolNames: Set<string> | null;
  callCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var referoClient: ReferoClientState | undefined;
  // eslint-disable-next-line no-var
  var referoExitHandlerRegistered: boolean | undefined;
}

function getState(): ReferoClientState {
  if (!globalThis.referoClient) {
    const token = process.env.REFERO_MCP_TOKEN;
    const client = new Client({ name: "one-box", version: "0.1.0" });
    const callbackUrl = referoCallbackUrl();
    const transport = new StreamableHTTPClientTransport(
      new URL(REFERO_MCP_URL),
      token
        ? {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
            fetch: referoFetch,
          }
        : {
            authProvider: new PersistentReferoOAuthProvider(
              callbackUrl,
              referoOAuthStorePath()
            ),
            fetch: referoFetch,
          }
    );
    globalThis.referoClient = { client, transport, connecting: null, toolNames: null, callCount: 0 };
    registerExitHandler();
  }
  return globalThis.referoClient;
}

async function ensureConnected(): Promise<Client> {
  const state = getState();
  if (!state.connecting) {
    state.connecting = state.client.connect(state.transport).catch((err) => {
      // allow a fresh singleton + retry on the next call after a failed connect
      globalThis.referoClient = undefined;
      if (err instanceof UnauthorizedError) {
        throw new Error(
          "Refero authorization is required — open /api/refero/connect in ONE BOX."
        );
      }
      throw err;
    });
  }
  await state.connecting;
  return state.client;
}

async function resolveToolNames(client: Client): Promise<Set<string>> {
  const state = getState();
  if (state.toolNames) return state.toolNames;
  const { tools } = await client.listTools();
  state.toolNames = new Set(tools.map((t) => t.name));
  return state.toolNames;
}

function pickToolName(available: Set<string>, candidates: string[]): string {
  const found = candidates.find((c) => available.has(c));
  if (!found) {
    throw new Error(
      `refero: none of [${candidates.join(", ")}] found among server tools: [${[...available].join(", ")}]`
    );
  }
  return found;
}

export function referoCallCount(): number {
  return globalThis.referoClient?.callCount ?? 0;
}

/** Connect + tools/list, returned as a sorted name array — the explicit
 * "discover exact tool names" step the smoke test and first-connect both
 * rely on (also warms the cached toolNames set used by every wrapper). */
export async function listReferoTools(): Promise<string[]> {
  const client = await ensureConnected();
  const names = await resolveToolNames(client);
  return [...names].sort();
}

export async function closeReferoClient(): Promise<void> {
  const state = globalThis.referoClient;
  if (!state) return;
  globalThis.referoClient = undefined;
  try {
    await state.client.close();
  } catch {
    // best-effort — process is exiting either way
  }
}

function registerExitHandler(): void {
  if (globalThis.referoExitHandlerRegistered) return;
  globalThis.referoExitHandlerRegistered = true;
  const handler = () => {
    void closeReferoClient();
  };
  process.once("beforeExit", handler);
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}

// ---------- low-level call + parse ----------

interface ReferoCallResult {
  content: ContentBlock[];
  structuredContent?: Record<string, unknown>;
}

async function invokeRefero(
  candidateNames: string[],
  args: Record<string, unknown>
): Promise<ReferoCallResult> {
  const client = await ensureConnected();
  const toolNames = await resolveToolNames(client);
  const name = pickToolName(toolNames, candidateNames);
  const state = getState();
  state.callCount += 1;
  // Durable month ledger — the in-memory count above resets on every restart.
  // This deliberately runs on the critical path: budget enforcement must
  // reserve the call before the MCP network request fires. ONLY a typed
  // storage failure may proceed unreserved — any other error is a bug in the
  // budget layer and swallowing it would silently turn the cap off.
  try {
    const usage = await reserveReferoCall(name);
    console.log(`[refero] call #${usage.count}/${usage.cap} (${usage.month}) → ${name}`);
  } catch (error) {
    if (!(error instanceof ReferoLedgerUnavailableError)) throw error;
    console.log(`[refero] call #${state.callCount} (ledger unavailable) → ${name}`);
  }

  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const msg = extractText((result.content ?? []) as ContentBlock[]) || "tool call failed";
    throw new Error(`refero ${name}: ${msg}`);
  }
  return {
    content: (result.content ?? []) as ContentBlock[],
    structuredContent: result.structuredContent as Record<string, unknown> | undefined,
  };
}

function extractText(content: ContentBlock[]): string | undefined {
  const parts = content.filter((c): c is TextBlock => c.type === "text");
  const text = parts.map((p) => p.text).join("\n\n");
  return text || undefined;
}

function extractImages(content: ContentBlock[]): ImageBlock[] {
  return content.filter((c): c is ImageBlock => c.type === "image");
}

/** structuredContent first; else try to JSON.parse the text content; else
 * hand back the raw text. This is what `refero_get_style`/`refero_get_screen`
 * actually return (verified live 2026-08-12: response_format:"json" comes
 * back as a JSON string in a text block, not structuredContent). */
function parsePayload(result: ReferoCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }
  const text = extractText(result.content);
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asOptionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// ---------- search-result markdown parsing ----------
//
// Verified live 2026-08-12: refero_search_styles/refero_search_screens do
// NOT return structuredContent or JSON — they return one text block of
// rendered markdown, one `## Style: <uuid>` / `## Screen: <uuid>` section
// per result, each with `- **Key**: value` bullets (value sometimes
// wrapping onto an indented continuation line) and, for screens, nested
// `### Content` / `### Site` subsections whose bullets get a
// `content_`/`site_` prefix so a repeated key like "Description" can't
// collide across subsections.

interface MarkdownRecord {
  id: string;
  fields: Record<string, string>;
}

const RECORD_HEADING_RE = /^##\s+(?:Style|Screen)\s*:\s*(\S+)\s*$/i;
const SUBSECTION_HEADING_RE = /^###\s+(.+?)\s*$/;
const BULLET_RE = /^-\s+\*\*(.+?)\*\*:\s*(.*)$/;

function slugKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseMarkdownRecords(text: string): MarkdownRecord[] {
  const records: MarkdownRecord[] = [];
  let current: MarkdownRecord | null = null;
  let subsection = "";
  let lastKey: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    const heading = line.match(RECORD_HEADING_RE);
    if (heading) {
      if (current) records.push(current);
      current = { id: heading[1], fields: {} };
      subsection = "";
      lastKey = null;
      continue;
    }
    if (!current) continue;

    const sub = line.match(SUBSECTION_HEADING_RE);
    if (sub) {
      subsection = slugKey(sub[1]);
      lastKey = null;
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const rawKey = slugKey(bullet[1]);
      const key = subsection ? `${subsection}_${rawKey}` : rawKey;
      current.fields[key] = bullet[2].trim();
      lastKey = key;
      continue;
    }

    if (line.trim() === "---") {
      lastKey = null;
      continue;
    }

    // wrapped continuation of the previous bullet's value (e.g. Description)
    if (lastKey && line.trim()) {
      current.fields[lastKey] = `${current.fields[lastKey]} ${line.trim()}`.trim();
    }
  }
  if (current) records.push(current);
  return records;
}

/** structuredContent first (forward-compat, in case Refero adds it later
 * for search too), else parse the rendered markdown text — see above. */
function parseSearchRecords(result: ReferoCallResult): MarkdownRecord[] {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    const arr = Object.values(result.structuredContent).find((v) => Array.isArray(v)) as
      | unknown[]
      | undefined;
    return (arr ?? []).map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "string") fields[slugKey(k)] = v;
      }
      return { id: asString(r.id ?? r.uuid ?? r.style_id ?? r.screen_id), fields };
    });
  }
  return parseMarkdownRecords(extractText(result.content) ?? "");
}

function normalizeStyleRecord(rec: MarkdownRecord): StyleSummary {
  const f = rec.fields;
  return {
    id: rec.id,
    name: f.title ?? f.domain ?? "",
    summary: f.description ?? "",
    sourceUrl: f.url,
    previewImageUrl: f.preview_url,
    platform: f.platform,
  };
}

function normalizeScreenRecord(rec: MarkdownRecord): ScreenSummary {
  const f = rec.fields;
  return {
    id: rec.id,
    name: f.site_name ?? f.page_url ?? "",
    summary: f.content_description ?? f.description ?? "",
    platform: f.platform,
    appName: f.site_name,
  };
}

// ---------- public wrappers ----------

/** Do NOT pass `limit`/`page` semantics into the MCP call beyond `query` —
 * refero_search_styles only accepts {query, page} per its own docs; `limit`
 * here slices the results client-side. */
export async function searchStyles(query: string, limit = 5): Promise<StyleSummary[]> {
  const result = await invokeRefero(["refero_search_styles"], { query });
  return parseSearchRecords(result).slice(0, limit).map(normalizeStyleRecord);
}

export async function searchScreens(
  query: string,
  limit = 5,
  platform: "web" | "ios" = "web"
): Promise<ScreenSummary[]> {
  const result = await invokeRefero(["refero_search_screens"], { query, platform });
  return parseSearchRecords(result).slice(0, limit).map(normalizeScreenRecord);
}

export async function getStyle(styleId: string): Promise<unknown> {
  const result = await invokeRefero(["refero_get_style"], {
    style_id: styleId,
    response_format: "json",
  });
  return parsePayload(result);
}

export async function getScreen(screenId: string): Promise<unknown> {
  const result = await invokeRefero(["refero_get_screen"], { screen_id: screenId });
  return parsePayload(result);
}

export async function getScreenImage(
  screenId: string,
  imageSize: "thumbnail" | "full" = "thumbnail"
): Promise<{ data: string; mimeType: string } | undefined> {
  const result = await invokeRefero(["refero_get_screen_image"], {
    screen_id: screenId,
    image_size: imageSize,
  });
  return extractImages(result.content)[0];
}
