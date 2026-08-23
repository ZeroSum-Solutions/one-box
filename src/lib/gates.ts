/**
 * Quality gates for a built site (sites/<runId>/site/). Gates measure the
 * BUILT SITE, not the design contract (audit E24) — everything runs against
 * a real Playwright page load, never a static grep of DESIGN.md.
 *
 * (a) token-drift   BLOCKING — every rendered color/font traces to tokens.css,
 *                    and every custom property the stylesheets reference is
 *                    actually defined (ENG-006)
 * (a2) color-role-compliance BLOCKING — structured token bans are never used
 *                    in their forbidden rendered contexts
 * (b) axe           BLOCKING — zero serious/critical a11y violations
 * (b2) contrast     BLOCKING — WCAG AA over the rendered page at two widths,
 *                    INCLUDING hover states, which axe does not evaluate
 * (c) console-errors BLOCKING — no console errors on load
 * (d) assets        BLOCKING — every img/stylesheet/script resolves, every
 *                    internal #anchor resolves, tel: links match intake phone
 * (e) no-js         BLOCKING — hero/nav/contact CTA visible with JS disabled
 * (f) perf-budget   ADVISORY — transfer size + image bytes + DCL under a
 *                    throttled-CPU load; reports numbers, never blocks
 *
 * Live callers retain their run-ID/options API. Candidate callers use a
 * separate closed target derived from the OBX-010 candidate contract.
 */
import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import {
  SITES_DIR,
  SITE_DIR,
  ARTIFACTS,
  DesignTokensSchema,
  FORBIDDEN_CONTEXTS,
  GateReportSchema,
  IntakeSchema,
  CandidateGateReceiptV1Schema,
  RunIdSchema,
  type CandidateGateReceiptV1,
  type CandidateProvenanceV1,
  type DesignTokens,
  type GateReport,
} from "./contracts";
import { inspectCandidate, validateCandidateInventory } from "./candidate";
import { candidatePaths } from "./runstate";
import { findUnresolvedSheetRefs } from "./cssVars";
import { gateContrast } from "./contrastGate";

export interface RunGatesOptions {
  afterEdit?: boolean;
  /** URL that resolves directly to the built site's index.html. When
   * omitted, gates load the file straight off disk via file://. */
  baseUrl?: string;
}

export interface CandidateGateRunResult {
  receipt: CandidateGateReceiptV1;
  gateReportSha256: string;
}

type CandidateGateBinding = Readonly<{
  candidateManifestSha256: string;
  buildSha256: string;
  inputArtifactHashes: ReadonlyArray<
    CandidateProvenanceV1["inputArtifactHashes"][number]
  >;
}>;

type GateTarget = Readonly<{
  runRoot: string;
  siteRoot: string;
  reportPath: string;
  navigationUrl: string;
  candidateBinding?: CandidateGateBinding;
}>;

type GateInputSnapshot = Readonly<{
  relativePath: string;
  sha256?: string;
}>;

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW | NONBLOCK;
const MAX_GATE_INPUT_BYTES = 100 * 1024 * 1024;

const PERF_BUDGET = {
  totalBytes: 900 * 1024,
  imageBytes: 500 * 1024,
  domContentLoadedMs: 2000,
  cpuThrottleRate: 4,
};

export type ForbiddenContext = (typeof FORBIDDEN_CONTEXTS)[number];

export interface ColorRoleObservation {
  editId?: string;
  selector: string;
  context: ForbiddenContext;
  colorHex: string;
}

export interface ColorRoleViolation {
  selector: string;
  context: ForbiddenContext;
  colorHex: string;
  tokenName: string;
}

export function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (match) {
    const hex = match[1].toLowerCase();
    return `#${hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex}`;
  }
  // rgb()-valued tokens must not silently escape enforcement (review
  // finding); gradients stay out of scope — no single color to match.
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(?:1|1\.0*))?\s*\)$/i);
  if (!rgb) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  if (channels.some((channel) => channel > 255)) return undefined;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Pure decision core so role enforcement can be tested without Playwright. */
export function evaluateColorRoleCompliance(
  observations: readonly ColorRoleObservation[],
  tokens: DesignTokens
): ColorRoleViolation[] {
  const tokenColors = tokens.colors.flatMap((color) => {
    const value = normalizeHexColor(color.value);
    return value ? [{ ...color, value }] : [];
  });

  return observations.flatMap((observation) => {
    const colorHex = normalizeHexColor(observation.colorHex);
    if (!colorHex) return [];
    return tokenColors
      .filter(
        (token) =>
          token.value === colorHex && token.forbiddenContexts.includes(observation.context)
      )
      .map((token) => ({
        selector: observation.selector,
        context: observation.context,
        colorHex,
        tokenName: token.name,
      }));
  });
}

export async function runGates(runId: string, opts: RunGatesOptions = {}): Promise<GateReport[]> {
  const target = createLiveGateTarget(runId, opts);
  const { allowed, tokens, phone, unresolvedRefs } = await prepareGateInputs(target);

  // afterEdit re-checks only the two invariants amendment B8 calls out by
  // name (token lint + axe) — the full suite still runs on a fresh build.
  // contrast runs afterEdit too: a token edit is exactly how a passing pair
  // becomes a failing one, and that is the edit path's whole purpose.
  const gateNames = opts.afterEdit
    ? (["token-drift", "color-role-compliance", "axe", "contrast", "mobile-layout"] as const)
    : FULL_GATE_NAMES;

  const reports = await executeGateSuite(target, gateNames, {
    allowed,
    tokens,
    phone,
    unresolvedRefs,
  });

  await fs.mkdir(target.runRoot, { recursive: true });
  await writeGates(target.runRoot, reports);
  return reports;
}

const FULL_GATE_NAMES = [
  "token-drift",
  "color-role-compliance",
  "axe",
  "contrast",
  "console-errors",
  "assets",
  "no-js",
  "mobile-layout",
  "perf-budget",
] as const;

function createLiveGateTarget(
  runId: string,
  opts: RunGatesOptions,
): GateTarget {
  const parsedRunId = RunIdSchema.parse(runId);
  const runRoot = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    SITES_DIR,
    parsedRunId,
  );
  const siteRoot = path.join(/*turbopackIgnore: true*/ runRoot, SITE_DIR);
  return Object.freeze({
    runRoot,
    siteRoot,
    reportPath: path.join(runRoot, ARTIFACTS.gates),
    navigationUrl:
      opts.baseUrl ?? `file://${path.join(siteRoot, "index.html")}`,
  });
}

function assertDirectory(stat: BigIntStats, label: string): void {
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory`);
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertCandidateDirectories(target: {
  runRoot: string;
  candidateRoot: string;
  siteRoot: string;
}): Promise<void> {
  const relativeCandidate = path.relative(target.runRoot, target.candidateRoot);
  if (
    relativeCandidate === "" ||
    relativeCandidate.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidate)
  ) {
    throw new Error("candidate root must be inside its run root");
  }
  assertDirectory(
    await fs.lstat(target.runRoot, { bigint: true }),
    "candidate run root",
  );
  assertDirectory(
    await fs.lstat(target.candidateRoot, { bigint: true }),
    "candidate root",
  );
  assertDirectory(
    await fs.lstat(target.siteRoot, { bigint: true }),
    "candidate site root",
  );
}

async function createCandidateGateTarget(runId: string): Promise<GateTarget> {
  // candidatePaths validates before any filesystem or browser operation and
  // yields the only candidate layout accepted by this public entry point.
  const paths = candidatePaths(runId);
  const runRoot = path.dirname(paths.root);
  await assertCandidateDirectories({
    runRoot,
    candidateRoot: paths.root,
    siteRoot: paths.site,
  });
  const inspection = await inspectCandidate(runId);
  if (inspection.status !== "present" || !inspection.manifest) {
    throw new Error("candidate is absent or has no validated manifest");
  }
  if (inspection.provenance.state !== "ready-for-gates") {
    throw new Error("candidate must be ready-for-gates");
  }
  await validateCandidateInventory(paths.site, inspection.manifest);
  return Object.freeze({
    runRoot,
    siteRoot: paths.site,
    reportPath: paths.gates,
    navigationUrl: pathToFileURL(path.join(paths.site, "index.html")).href,
    candidateBinding: Object.freeze({
      candidateManifestSha256:
        inspection.provenance.candidateManifestSha256!,
      buildSha256: inspection.provenance.buildSha256!,
      inputArtifactHashes: Object.freeze(
        inspection.provenance.inputArtifactHashes.map((input) =>
          Object.freeze({ ...input }),
        ),
      ),
    }),
  });
}

async function readStableRegularFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  const initial = await fs.lstat(filePath, { bigint: true });
  if (initial.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!initial.isFile()) throw new Error(`${label} must be a regular file`);
  if (initial.nlink > BigInt(1)) throw new Error(`${label} must not be a hardlink`);
  if (initial.size > BigInt(MAX_GATE_INPUT_BYTES)) {
    throw new Error(`${label} exceeds the gate input size limit`);
  }
  const handle = await fs.open(filePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      !sameFile(initial, opened) ||
      opened.size !== initial.size
    ) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || opened.size !== after.size) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function boundInputHash(
  binding: CandidateGateBinding,
  relativePath: string,
): string | undefined {
  return binding.inputArtifactHashes.find((input) => input.path === relativePath)
    ?.sha256;
}

async function snapshotCandidateInput(
  target: GateTarget,
  relativePath: string,
  required: boolean,
): Promise<{ snapshot: GateInputSnapshot; bytes?: Buffer }> {
  const absolutePath = path.join(target.runRoot, relativePath);
  let bytes: Buffer | undefined;
  try {
    bytes = await readStableRegularFile(absolutePath, relativePath);
  } catch (error) {
    if (
      !required &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      const expected = boundInputHash(target.candidateBinding!, relativePath);
      if (expected) throw new Error(`bound gate input is missing: ${relativePath}`);
      return { snapshot: { relativePath } };
    }
    throw error;
  }
  const observedSha256 = sha256(bytes);
  const expected = boundInputHash(target.candidateBinding!, relativePath);
  if (expected && expected !== observedSha256) {
    throw new Error(`gate input SHA-256 does not match provenance: ${relativePath}`);
  }
  return {
    snapshot: { relativePath, sha256: observedSha256 },
    bytes,
  };
}

async function prepareGateInputs(target: GateTarget): Promise<{
  allowed: AllowedTokens;
  tokens: DesignTokens;
  phone?: string;
  unresolvedRefs: string[];
  candidateInputSnapshots?: readonly GateInputSnapshot[];
}> {
  const tokensCssText = await fs.readFile(
    path.join(target.siteRoot, "tokens.css"),
    "utf8",
  );
  const allowed = parseAllowedTokens(tokensCssText);
  if (!target.candidateBinding) {
    const tokens = DesignTokensSchema.parse(
      JSON.parse(
        await fs.readFile(path.join(target.runRoot, ARTIFACTS.tokens), "utf8"),
      ),
    );
    return {
      allowed,
      tokens,
      phone: await readIntakePhone(target.runRoot),
      unresolvedRefs: await findUnresolvedSheetRefs(
        target.siteRoot,
        tokensCssText,
      ),
    };
  }

  const tokenInput = await snapshotCandidateInput(
    target,
    ARTIFACTS.tokens,
    true,
  );
  const intakeInput = await snapshotCandidateInput(
    target,
    ARTIFACTS.intake,
    false,
  );
  const tokens = DesignTokensSchema.parse(
    JSON.parse(tokenInput.bytes!.toString("utf8")),
  );
  const phone = intakeInput.bytes
    ? IntakeSchema.parse(JSON.parse(intakeInput.bytes.toString("utf8"))).phone
    : undefined;
  return {
    allowed,
    tokens,
    phone,
    unresolvedRefs: await findUnresolvedSheetRefs(
      target.siteRoot,
      tokensCssText,
    ),
    candidateInputSnapshots: [tokenInput.snapshot, intakeInput.snapshot],
  };
}

async function executeGateSuite(
  target: GateTarget,
  gateNames: readonly string[],
  ctx: {
    allowed: AllowedTokens;
    tokens: DesignTokens;
    phone?: string;
    unresolvedRefs: string[];
  },
): Promise<GateReport[]> {
  const browser = await chromium.launch();
  const reports: GateReport[] = [];
  try {
    for (const name of gateNames) {
      const report = await runOne(browser, name, target.navigationUrl, {
        ...ctx,
        siteDir: target.siteRoot,
      });
      reports.push(GateReportSchema.parse(report));
    }
  } finally {
    await browser.close();
  }
  return reports;
}

async function revalidateCandidateTarget(
  runId: string,
  target: GateTarget,
  inputSnapshots: readonly GateInputSnapshot[],
): Promise<void> {
  const current = await createCandidateGateTarget(runId);
  if (
    current.runRoot !== target.runRoot ||
    current.siteRoot !== target.siteRoot ||
    current.reportPath !== target.reportPath ||
    current.navigationUrl !== target.navigationUrl ||
    current.candidateBinding?.candidateManifestSha256 !==
      target.candidateBinding?.candidateManifestSha256 ||
    current.candidateBinding?.buildSha256 !==
      target.candidateBinding?.buildSha256 ||
    JSON.stringify(current.candidateBinding?.inputArtifactHashes) !==
      JSON.stringify(target.candidateBinding?.inputArtifactHashes)
  ) {
    throw new Error("candidate binding changed during gate evaluation");
  }
  for (const before of inputSnapshots) {
    const after = await snapshotCandidateInput(
      current,
      before.relativePath,
      before.relativePath === ARTIFACTS.tokens,
    );
    if (after.snapshot.sha256 !== before.sha256) {
      throw new Error(
        `gate input changed during candidate evaluation: ${before.relativePath}`,
      );
    }
  }
}

async function atomicWriteCandidateReceipt(
  target: GateTarget,
  bytes: Buffer,
): Promise<void> {
  const temporary = `${target.reportPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, target.reportPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function runCandidateGates(
  runId: string,
): Promise<CandidateGateRunResult> {
  const target = await createCandidateGateTarget(runId);
  const prepared = await prepareGateInputs(target);
  const reports = await executeGateSuite(target, FULL_GATE_NAMES, prepared);
  await revalidateCandidateTarget(
    runId,
    target,
    prepared.candidateInputSnapshots!,
  );
  const receipt = CandidateGateReceiptV1Schema.parse({
    schemaVersion: 1,
    runId,
    candidateManifestSha256:
      target.candidateBinding!.candidateManifestSha256,
    buildSha256: target.candidateBinding!.buildSha256,
    reports,
  });
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  const gateReportSha256 = sha256(receiptBytes);
  await atomicWriteCandidateReceipt(target, receiptBytes);
  return { receipt, gateReportSha256 };
}

async function runOne(
  browser: import("playwright").Browser,
  name: string,
  url: string,
  ctx: {
    allowed: AllowedTokens;
    tokens: DesignTokens;
    phone?: string;
    unresolvedRefs: string[];
    siteDir: string;
  }
): Promise<GateReport> {
  switch (name) {
    case "token-drift":
      return withPage(browser, (page) => gateTokenDrift(page, url, ctx.allowed, ctx.unresolvedRefs));
    case "color-role-compliance":
      return withPage(browser, (page) => gateColorRoleCompliance(page, url, ctx.tokens));
    case "axe":
      return withPage(browser, (page) => gateAxe(page, url));
    case "contrast":
      return gateContrast(browser, url, ctx.siteDir);
    case "console-errors":
      return withPage(browser, (page) => gateConsoleErrors(page, url));
    case "assets":
      return withPage(browser, (page) => gateAssets(page, url, ctx.phone));
    case "no-js":
      return gateNoJs(browser, url);
    case "mobile-layout":
      return gateMobileLayout(browser, url);
    case "perf-budget":
      return withPage(browser, (page) => gatePerfBudget(page, url));
    default:
      throw new Error(`unknown gate: ${name}`);
  }
}

async function withPage<T>(
  browser: import("playwright").Browser,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  // Content-integrity gates care about the settled page, not an in-flight
  // CSS reveal transition — emulating reduced-motion makes reveal.js show
  // every [data-reveal] node at its final state synchronously (see
  // reveal.js), so axe/token-drift never race a mid-fade opacity frame.
  // Motion itself is a design concern the reduced-motion + no-js gates
  // already cover, not something these gates need to re-verify.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function writeGates(runRoot: string, reports: GateReport[]): Promise<void> {
  const target = path.join(runRoot, ARTIFACTS.gates);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(reports, null, 2), "utf8");
  await fs.rename(tmp, target);
}

async function readIntakePhone(runRoot: string): Promise<string | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(runRoot, ARTIFACTS.intake), "utf8"));
    return IntakeSchema.parse(raw).phone;
  } catch {
    return undefined; // no intake.json in this run — tel: check degrades to informational
  }
}

// ---------- (a) token-drift ----------

interface AllowedTokens {
  colorRgb: Set<string>; // normalized "rgb(r, g, b)" / "rgba(r, g, b, a)"
  fontFirstFamilies: Set<string>; // lowercased, quote-stripped
}

function parseAllowedTokens(cssText: string): AllowedTokens {
  const colorRgb = new Set<string>(["rgba(0, 0, 0, 0)", "transparent", "currentcolor"]);
  const fontFirstFamilies = new Set<string>();
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(cssText))) {
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    if (name.startsWith("--color-")) {
      const rgb = colorToRgbString(value);
      if (rgb) colorRgb.add(rgb);
    } else if (name.startsWith("--font-")) {
      const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
      if (first) fontFirstFamilies.add(first.toLowerCase());
    }
  }
  return { colorRgb, fontFirstFamilies };
}

function colorToRgbString(value: string): string | undefined {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) {
      const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (/^rgba?\(/i.test(value)) {
    // Already in functional form — pass through with Chromium's own comma-space
    // normalization so it compares equal to getComputedStyle output.
    const nums = value.match(/[\d.]+/g);
    if (!nums) return undefined;
    return nums.length === 4
      ? `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]})`
      : `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
  }
  // gradients / hsl() / named colors used as a color-*, not rendering-checkable
  // by this gate (see WAVE-NOTES-buildgate.md) — no entry added, not a failure.
  return undefined;
}

async function gateTokenDrift(
  page: Page,
  url: string,
  allowed: AllowedTokens,
  unresolvedRefs: string[] = []
): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const elements = await page.$$eval("body *", (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        editId: el.getAttribute("data-edit-id") ?? "",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontFamily: cs.fontFamily,
      };
    })
  );

  // Listed first: an unresolved reference explains the computed-value
  // failures below it, rather than being buried under forty of them.
  const details: string[] = unresolvedRefs.map(
    (name) => `${name} is referenced by the stylesheets but defined nowhere — every declaration using it is dropped`
  );
  for (const el of elements) {
    if (["script", "style"].includes(el.tag)) continue;
    if (!isAllowedColor(el.color, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> color ${el.color} not in tokens.css`);
    }
    if (!isAllowedColor(el.backgroundColor, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> backgroundColor ${el.backgroundColor} not in tokens.css`);
    }
    if (!isAllowedFont(el.fontFamily, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> fontFamily ${el.fontFamily} not in tokens.css`);
    }
  }

  return {
    gate: "token-drift",
    pass: details.length === 0,
    blocking: true,
    details: details.slice(0, 40),
    ranAt: new Date().toISOString(),
  };
}

function isAllowedColor(value: string, allowed: AllowedTokens): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "inherit" || v === "currentcolor") return true;
  return allowed.colorRgb.has(v) || allowed.colorRgb.has(value.trim());
}

function isAllowedFont(stack: string, allowed: AllowedTokens): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return !!first && allowed.fontFirstFamilies.has(first);
}

// ---------- (a2) color-role-compliance ----------

async function gateColorRoleCompliance(
  page: Page,
  url: string,
  tokens: DesignTokens
): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const tokenHexes = tokens.colors
    .map((color) => normalizeHexColor(color.value))
    .filter((color): color is string => Boolean(color));
  const observations = await page.evaluate((knownTokenHexes) => {
    const knownColors = new Set(knownTokenHexes);
    const observations: Array<{
      editId?: string;
      selector: string;
      context: ForbiddenContext;
      colorHex: string;
    }> = [];
    const seen = new Set<string>();

    const rgbToHex = (value: string): string | undefined => {
      const channels = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
      if (!channels || (channels[4] !== undefined && Number(channels[4]) !== 1)) return undefined;
      return `#${[channels[1], channels[2], channels[3]]
        .map((channel) => Number(channel).toString(16).padStart(2, "0"))
        .join("")}`;
    };
    const selectorFor = (element: Element, editId: string | null): string =>
      editId ? `[data-edit-id="${editId}"]` : element.tagName.toLowerCase();
    const add = (element: Element, editId: string | null, context: ForbiddenContext, value: string) => {
      const colorHex = rgbToHex(value);
      if (!colorHex || !knownColors.has(colorHex)) return;
      const selector = selectorFor(element, editId);
      const key = `${selector}|${context}|${colorHex}`;
      if (seen.has(key)) return;
      seen.add(key);
      observations.push({
        ...(editId ? { editId } : {}),
        selector,
        context,
        colorHex,
      });
    };

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const tag = element.tagName.toLowerCase();
      if (["script", "style"].includes(tag)) continue;
      const styles = getComputedStyle(element);
      const editId = element.getAttribute("data-edit-id");
      const rect = element.getBoundingClientRect();
      const isLargeSurface = rect.width >= window.innerWidth * 0.6 && rect.height >= 200;

      // Interactive controls are button surfaces, never section surfaces —
      // a full-width CTA button must not false-block as a section background
      // (review finding).
      const isInteractive =
        ["button", "a", "input", "select", "textarea"].includes(tag) ||
        element.getAttribute("role") === "button";

      if (tag === "section" || (editId && isLargeSurface && !isInteractive)) {
        add(element, editId, "section-background", styles.backgroundColor);
      }
      if (isLargeSurface && !isInteractive) {
        add(element, editId, "large-surface", styles.backgroundColor);
      }
      // span is excluded: eyebrow/badge chrome shares the tag with prose and
      // false-blocks accent colors (review finding). Real copy lives in p/li.
      if (["p", "li"].includes(tag)) add(element, editId, "body-text", styles.color);
      if (/^h[1-6]$/.test(tag)) add(element, editId, "heading-text", styles.color);
      if (tag === "button" || element.getAttribute("role") === "button") {
        add(element, editId, "button-background", styles.backgroundColor);
      }
      // Zero-width borders still report a computed color (usually
      // currentColor), which false-blocks text tokens that ban borders
      // (review finding) — only sample borders that actually paint.
      const borders: Array<[string, string, string]> = [
        [styles.borderTopWidth, styles.borderTopStyle, styles.borderTopColor],
        [styles.borderRightWidth, styles.borderRightStyle, styles.borderRightColor],
        [styles.borderBottomWidth, styles.borderBottomStyle, styles.borderBottomColor],
        [styles.borderLeftWidth, styles.borderLeftStyle, styles.borderLeftColor],
      ];
      for (const [borderWidth, borderStyle, borderColor] of borders) {
        if (parseFloat(borderWidth) > 0 && borderStyle !== "none" && borderStyle !== "hidden") {
          add(element, editId, "border", borderColor);
        }
      }
    }
    return observations;
  }, tokenHexes);
  const violations = evaluateColorRoleCompliance(observations, tokens);

  return {
    gate: "color-role-compliance",
    pass: violations.length === 0,
    blocking: true,
    details: violations.map(
      (violation) =>
        `${violation.selector} uses ${violation.tokenName} (${violation.colorHex}) in forbidden ${violation.context}`
    ),
    ranAt: new Date().toISOString(),
  };
}

// ---------- (b) axe ----------

async function gateAxe(page: Page, url: string): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return {
    gate: "axe",
    pass: serious.length === 0,
    blocking: true,
    details: results.violations.map((v) => `${v.impact ?? "n/a"}: ${v.id} — ${v.help} (${v.nodes.length} node(s))`),
    ranAt: new Date().toISOString(),
  };
}

// ---------- (c) console-errors ----------

async function gateConsoleErrors(page: Page, url: string): Promise<GateReport> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(300); // let async reveal/counter code settle
  return {
    gate: "console-errors",
    pass: errors.length === 0,
    blocking: true,
    details: errors,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (d) assets ----------

async function gateAssets(page: Page, url: string, phone: string | undefined): Promise<GateReport> {
  const badResponses: string[] = [];
  page.on("response", (res) => {
    if (!res.ok() && res.status() !== 0) badResponses.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    badResponses.push(`FAILED ${req.url()} (${req.failure()?.errorText ?? "unknown"})`);
  });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(200);

  const details: string[] = [...new Set(badResponses)];

  const anchors = await page.$$eval("a[href]", (els) => els.map((el) => el.getAttribute("href") ?? ""));
  for (const href of anchors) {
    if (!href.startsWith("#") || href === "#") continue;
    const id = href.slice(1);
    const found = await page.locator(`[id="${id}"]`).count();
    if (found === 0) details.push(`internal anchor href="${href}" has no matching id`);
  }

  const telLinks = await page.$$eval("a[href^='tel:']", (els) =>
    els.map((el) => el.getAttribute("href") ?? "")
  );
  if (phone) {
    const expectedDigits = phone.replace(/[^\d]/g, "");
    for (const href of telLinks) {
      const hrefDigits = href.replace(/[^\d]/g, "");
      if (hrefDigits !== expectedDigits) {
        details.push(`tel: link "${href}" does not match intake phone "${phone}"`);
      }
    }
  } else if (telLinks.length === 0) {
    details.push("no intake.json phone available and no tel: links found — nothing to verify");
  }

  return {
    gate: "assets",
    pass: details.length === 0 || (details.length === 1 && details[0].startsWith("no intake.json")),
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (e) no-js ----------

async function gateNoJs(browser: import("playwright").Browser, url: string): Promise<GateReport> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    const checks: Array<[string, string]> = [
      ["hero headline", '[data-edit-id="hero.headline"]'],
      ["nav", "nav"],
      ["contact CTA", '[data-edit-id="contact.cta"]'],
    ];
    for (const [label, selector] of checks) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (!visible) details.push(`${label} (${selector}) not visible with JavaScript disabled`);
    }
  } finally {
    await context.close();
  }
  return {
    gate: "no-js",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (f) mobile-layout ----------

/**
 * 390px invariants. Two failure modes that desktop review never catches and
 * that both shipped live before this gate existed:
 *
 * (1) horizontal overflow — anything wider than the viewport;
 * (2) word-stacking — a short label squeezed so narrow that each word wraps
 *     to its own line (a 14-char phone number rendered over 3 lines). Any
 *     leaf element with a short string across ≥3 lines is a squeeze, since
 *     no deliberate design breaks a 40-character label that way.
 */
async function gateMobileLayout(
  browser: import("playwright").Browser,
  url: string
): Promise<GateReport> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  let details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    details = await page.evaluate(() => {
      const out: string[] = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        out.push(
          `page scrolls horizontally: content ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`
        );
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1) {
          out.push(
            `<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ""}> overflows the viewport (right edge ${Math.round(rect.right)}px)`
          );
        }
        const text = (el.textContent ?? "").trim();
        if (!text || text.length > 40) continue;
        if (el.children.length > 0) continue; // leaf text nodes only
        // Count real line boxes via a Range — height/line-height overcounts
        // on padded elements (a one-line button reads as three).
        const node = el.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getClientRects().length;
        // A long headline wrapping to 4 lines is design; a 14-character phone
        // number over 3 lines is a squeeze. Characters-per-line separates
        // them — word-stacking always lands far below a normal line's worth.
        if (lines >= 3 && text.length / lines < 8) {
          out.push(
            `"${text}" wraps to ${lines} lines at 390px (element only ${Math.round(rect.width)}px wide)`
          );
        }
      }
      return out.slice(0, 20);
    });
  } finally {
    await context.close();
  }
  return {
    gate: "mobile-layout",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (g) perf-budget (advisory) ----------

async function gatePerfBudget(page: Page, url: string): Promise<GateReport> {
  let totalBytes = 0;
  let imageBytes = 0;
  const responseSizes: Promise<void>[] = [];

  page.on("response", (res) => {
    const p = res
      .request()
      .sizes()
      .then((sizes) => {
        const bytes = sizes.responseBodySize + sizes.responseHeadersSize;
        totalBytes += bytes;
        const ct = res.headers()["content-type"] ?? "";
        if (ct.startsWith("image/")) imageBytes += bytes;
      })
      .catch(() => undefined);
    responseSizes.push(p);
  });

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: PERF_BUDGET.cpuThrottleRate });

  await page.goto(url, { waitUntil: "load" });
  await Promise.all(responseSizes);

  const dcl = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav ? Math.round(nav.domContentLoadedEventEnd) : -1;
  });

  const pass =
    totalBytes < PERF_BUDGET.totalBytes && imageBytes < PERF_BUDGET.imageBytes && dcl >= 0 && dcl < PERF_BUDGET.domContentLoadedMs;

  return {
    gate: "perf-budget",
    pass,
    blocking: false,
    details: [
      `total transfer: ${Math.round(totalBytes / 1024)}KB (budget ${PERF_BUDGET.totalBytes / 1024}KB)`,
      `image bytes: ${Math.round(imageBytes / 1024)}KB (budget ${PERF_BUDGET.imageBytes / 1024}KB)`,
      `DOMContentLoaded: ${dcl}ms at ${PERF_BUDGET.cpuThrottleRate}x CPU throttle (budget ${PERF_BUDGET.domContentLoadedMs}ms)`,
    ],
    ranAt: new Date().toISOString(),
  };
}
