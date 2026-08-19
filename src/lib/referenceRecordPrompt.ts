/**
 * Serializes a full Refero style/screen record for a synthesis prompt.
 *
 * The old blind `slice(0, 14000)` regularly cut the tail of larger styles —
 * and Refero's field order puts surfaces, components, layout rhythm, and
 * do/don't rules late in the payload, so the cut fell exactly on the
 * composition guidance the tokens-only A/B never tested. Verified live
 * 2026-08-15: the one low-value verbose field is the customSections entry
 * titled "Agent Prompt Guide" (other entries there, e.g. "Motion Philosophy",
 * carry real design signal), so that entry is dropped before any hard slice.
 */
export const REFERENCE_RECORD_PROMPT_CAP = 24_000;

interface CustomSectionLike {
  title?: unknown;
}

function withoutAgentPromptGuide(record: unknown): unknown {
  if (typeof record !== "object" || record === null) return record;
  const sections = (record as { customSections?: unknown }).customSections;
  if (!Array.isArray(sections)) return record;
  const kept = sections.filter(
    (s: CustomSectionLike) =>
      typeof s?.title !== "string" || !/agent prompt guide/i.test(s.title)
  );
  if (kept.length === sections.length) return record;
  return { ...(record as Record<string, unknown>), customSections: kept };
}

export function serializeReferenceRecordForPrompt(
  record: unknown,
  cap = REFERENCE_RECORD_PROMPT_CAP
): string {
  const full = JSON.stringify(record) ?? "null";
  if (full.length <= cap) return full;
  const trimmed = JSON.stringify(withoutAgentPromptGuide(record)) ?? "null";
  return trimmed.length <= cap ? trimmed : trimmed.slice(0, cap);
}
