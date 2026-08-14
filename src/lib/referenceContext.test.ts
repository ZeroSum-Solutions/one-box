import { describe, expect, it } from "vitest";
import { IntakeSchema } from "./contracts";
import { requiredReferenceContext } from "./referenceContext";

const intake = IntakeSchema.parse({
  businessName: "Acme",
  category: "services",
  location: "Reno",
  services: ["Installation"],
  primaryAction: "quote",
  research: {
    enabled: true,
    businessIntelligence: false,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: false,
  },
});

describe("requiredReferenceContext", () => {
  it("uses the authoritative intake choice rather than the experiment arm default", () => {
    expect(requiredReferenceContext("refero", {
      ...intake,
      research: { ...intake.research, referoDesignEvidence: false },
    })).toBe(
      "explicit-no-reference"
    );
    expect(requiredReferenceContext("refero", intake)).toBe(
      "design-and-references"
    );
    expect(requiredReferenceContext("none", intake)).toBe(
      "explicit-no-reference"
    );
  });
});
