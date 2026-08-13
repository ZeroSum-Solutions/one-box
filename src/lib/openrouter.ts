/**
 * OpenRouter is the app's ONLY model runtime (plan §Model routing — Claude
 * never enters the metered path). This module owns the provider instance
 * and every cost-tracked call shape the pipeline/API routes use:
 *
 * - `openrouter`      raw provider, for callers that build their own
 *                      streamText/generateText (e.g. the intake chat route,
 *                      which has no runId yet to bill against).
 * - `chat`             general-purpose cost-tracked generateText passthrough
 *                      (tools, multi-step, etc).
 * - `generateTextCapped` minimal cost-tracked plain-text generation.
 * - `generateJson`     cost-tracked structured generation against a Zod
 *                      schema — the workhorse the pipeline stages use.
 *
 * Every call's real spend (OpenRouter's inline usage accounting, or the
 * /generation endpoint fallback when that's absent) is added to the run's
 * costUsd via runstate.addCost, which throws CostCapExceeded once a run
 * passes its cap — propagated here, never swallowed.
 */
import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import {
  generateObject,
  generateText,
  NoObjectGeneratedError,
  type ModelMessage,
  type ProviderMetadata,
  type ToolSet,
} from "ai";
import type { ZodType } from "zod";
import { addCost, CostCapExceeded } from "./runstate";

export { CostCapExceeded };

export const openrouter: OpenRouterProvider = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — source ~/.config/zs-api-keys.env or run scripts/dev.sh"
    );
  }
  return apiKey;
}

const GENERATION_ENDPOINT = "https://openrouter.ai/api/v1/generation";

/** Fallback for when inline usage accounting didn't come back on the
 * response (older/edge-case providers behind OpenRouter). */
async function fetchGenerationCost(
  generationId: string,
  apiKey: string
): Promise<number | undefined> {
  try {
    const res = await fetch(
      `${GENERATION_ENDPOINT}?id=${encodeURIComponent(generationId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: { total_cost?: number } };
    return body.data?.total_cost;
  } catch {
    return undefined;
  }
}

interface CostableResult {
  providerMetadata?: ProviderMetadata;
  response?: { id?: string };
}

async function trackCost(
  runId: string,
  result: CostableResult,
  apiKey: string
): Promise<{ costUsd: number; runCostUsd: number }> {
  const orUsage = (
    result.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined
  )?.usage;
  let costUsd = orUsage?.cost;
  if (costUsd === undefined && result.response?.id) {
    costUsd = await fetchGenerationCost(result.response.id, apiKey);
  }
  if (costUsd === undefined) {
    console.warn(
      `[openrouter] run ${runId}: no usage cost on response — recording $0 (usage accounting and /generation lookup both came back empty)`
    );
    costUsd = 0;
  }
  const state = await addCost(runId, costUsd);
  return { costUsd, runCostUsd: state.costUsd };
}

// ---------- chat: general-purpose cost-tracked generateText ----------

export type ChatOptions<TOOLS extends ToolSet = ToolSet> = Omit<
  Parameters<typeof generateText<TOOLS>>[0],
  "model"
> & {
  /** run this call's spend is billed to (sites/<id>/run.json) */
  runId: string;
};

export type ChatResult<TOOLS extends ToolSet = ToolSet> = Awaited<
  ReturnType<typeof generateText<TOOLS>>
> & {
  /** this call's spend in USD */
  costUsd: number;
  /** the run's total costUsd after this call */
  runCostUsd: number;
};

export async function chat<TOOLS extends ToolSet = ToolSet>(
  model: string,
  opts: ChatOptions<TOOLS>
): Promise<ChatResult<TOOLS>> {
  const { runId, ...rest } = opts;
  const apiKey = requireApiKey();
  const languageModel = openrouter.chat(model, { usage: { include: true } });
  const result = await generateText<TOOLS>({
    model: languageModel,
    ...rest,
  } as Parameters<typeof generateText<TOOLS>>[0]);
  const { costUsd, runCostUsd } = await trackCost(runId, result, apiKey);
  return { ...result, costUsd, runCostUsd };
}

// ---------- generateTextCapped: minimal cost-tracked plain text ----------

export interface GenerateTextCappedOptions {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generateTextCapped(
  runId: string,
  model: string,
  opts: GenerateTextCappedOptions
): Promise<string> {
  const apiKey = requireApiKey();
  const languageModel = openrouter.chat(model, { usage: { include: true } });
  const result = await generateText({
    model: languageModel,
    ...opts,
  } as Parameters<typeof generateText>[0]);
  await trackCost(runId, result, apiKey);
  return result.text;
}

// ---------- generateJson: cost-tracked structured generation ----------

/** Peel code fences / surrounding prose off a would-be JSON payload. */
function extractJsonCandidate(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) t = fence[1].trim();
  const start = t.search(/[{[]/);
  if (start > 0) {
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (end > start) t = t.slice(start, end + 1);
  }
  return t;
}

/** A failed generateObject call still spent money — bill it to the run. */
async function billFailedGeneration(
  runId: string,
  err: NoObjectGeneratedError,
  apiKey: string
): Promise<void> {
  const id = err.response?.id;
  if (!id) return;
  const cost = await fetchGenerationCost(id, apiKey);
  if (cost) await addCost(runId, cost); // CostCapExceeded propagates — never swallow
}

/**
 * Generate an object matching `schema` and return it directly (already
 * validated by the model-side schema + zod). Uses the (deprecated-but-
 * functional) `generateObject` primitive — simpler than generateText's
 * `output` setting for this use case; see WAVE-NOTES for the tradeoff.
 *
 * Schema misses are the #1 live failure (Kimi K3 wraps JSON in fences or
 * drifts on record-typed fields), so this self-heals: bill the failed call,
 * try a zero-cost local repair of the raw text, then retry the model with
 * the validation error as feedback — up to 3 model calls total.
 */
export async function generateJson<T>(
  runId: string,
  model: string,
  schema: ZodType<T>,
  prompt: string,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const apiKey = requireApiKey();
  const languageModel = openrouter.chat(model, { usage: { include: true } });
  // Providers occasionally hang mid-generation (observed live on the gate
  // repair call) — a per-attempt deadline turns that into an honest failure.
  const timeoutMs = opts.timeoutMs ?? 300_000;

  let attemptPrompt = prompt;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await generateObject({
        model: languageModel,
        schema,
        prompt: attemptPrompt,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      await trackCost(runId, result, apiKey);
      return result.object;
    } catch (err) {
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
      lastError = err;
      await billFailedGeneration(runId, err, apiKey);

      // zero-cost local repair: fence-strip + parse + validate
      const raw = err.text ?? "";
      if (raw) {
        try {
          const parsed = schema.safeParse(JSON.parse(extractJsonCandidate(raw)));
          if (parsed.success) return parsed.data;
        } catch {
          // not locally repairable — fall through to a model retry
        }
      }

      const problem =
        err.cause instanceof Error ? err.cause.message : err.message;
      attemptPrompt = `${prompt}\n\nYour previous response did not match the required JSON schema.\nPrevious response (broken):\n${raw.slice(0, 6000)}\n\nValidation problem:\n${String(problem).slice(0, 2000)}\n\nReturn ONLY the corrected JSON object matching the schema exactly. No prose, no code fences, no extra keys. Record-typed fields must map string keys to plain string values.`;
      console.warn(
        `[openrouter] run ${runId}: generateJson attempt ${attempt + 1} failed schema (${model}) — retrying with feedback`
      );
    }
  }
  throw lastError;
}
