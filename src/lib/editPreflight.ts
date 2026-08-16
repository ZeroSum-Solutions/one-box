import { EditClassificationSchema, MODELS, type DesignTokens, type ReferenceStyleDigest } from "./contracts";
import { describeTokensForEdit } from "./editorPromptContext";
import { generateJson } from "./openrouter";
import { hasReferenceProfileJargon } from "./referenceStage";

type JsonGenerator = (...args: Parameters<typeof generateJson>) => Promise<unknown>;

export interface EditPreflightContext {
  instruction: string;
  elementTag: string;
  elementRole?: string;
  tokens: DesignTokens;
  digest?: ReferenceStyleDigest;
}

export interface EditPreflightDeps {
  generateJson?: JsonGenerator;
}

function normalizePlainLanguage(value: string): string {
  if (!hasReferenceProfileJargon(value)) return value;
  return value
    .replace(/\btailwind\s+design\s+system\b/gi, "the site's existing style choices")
    .replace(/\bcss\b/gi, "the visual direction")
    .replace(/\btokens?\b/gi, "saved style choices")
    .replace(/\btailwind\b/gi, "the site's style rules")
    .replace(/\bdesign\s+system\b/gi, "the site's look")
    .replace(/\bhex\b/gi, "color code")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeClassification(value: unknown) {
  const classification = EditClassificationSchema.parse(value);
  if (classification.decision === "apply") return classification;
  return {
    ...classification,
    reason: normalizePlainLanguage(classification.reason),
    ...(classification.suggestedAlternative
      ? { suggestedAlternative: normalizePlainLanguage(classification.suggestedAlternative) }
      : {}),
  };
}

/**
 * Advisory compatibility check before an element edit enters its mutation lock.
 * Final HTML generation deliberately remains inside applyElementHtmlEdit so it
 * always sees the current source under site authority.
 */
export async function classifyEditInstruction(
  runId: string,
  context: EditPreflightContext,
  deps: EditPreflightDeps = {},
) {
  const generator = deps.generateJson ?? generateJson;
  const digest = context.digest
    ? `\n\nLOCKED DESIGN DIRECTION:\nPreserve: ${context.digest.preserveTraits.join("; ")}\nRules: ${context.digest.dosDonts.map((entry) => `${entry.polarity}: ${entry.rule}`).join("; ")}`
    : "";
  try {
    const result = await generator(
      runId,
      MODELS.bulk,
      EditClassificationSchema,
      `Classify this requested website edit before it is applied. Return apply when it fits the locked look. Return redirect only when the request would break the locked look but a close, compliant alternative is possible; state that alternative plainly. Return refuse only when it cannot be done safely; say why plainly and suggest a safe direction when useful. Use plain language for a business owner: never mention CSS, tokens, Tailwind, a design system, or hex values. Do not write HTML or propose implementation details.\n\nINSTRUCTION: ${context.instruction}\nELEMENT: <${context.elementTag}>${context.elementRole ? `, role: ${context.elementRole}` : ""}\n\nLOCKED DESIGN RULES:\n${describeTokensForEdit(context.tokens)}${digest}`,
    );
    return normalizeClassification(result);
  } catch {
    console.warn(
      `[edit-preflight] run ${runId}: classification failed; applying edit through deterministic gates`,
    );
    return { decision: "apply" } as const;
  }
}
