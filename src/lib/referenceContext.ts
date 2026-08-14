import type { Intake, ReferenceMode } from "./contracts";

export type RequiredReferenceContext =
  | "design-and-references"
  | "explicit-no-reference";

export function requiredReferenceContext(
  referenceMode: ReferenceMode,
  intake?: Intake
): RequiredReferenceContext {
  if (referenceMode === "none") {
    return "explicit-no-reference";
  }
  if (
    intake &&
    (!intake.research.enabled || !intake.research.referoDesignEvidence)
  ) {
    return "explicit-no-reference";
  }
  return "design-and-references";
}
