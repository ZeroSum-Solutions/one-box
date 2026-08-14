import { describe, expect, it } from "vitest";
import {
  FIRECRAWL_CONSENT_HELP,
  FIRECRAWL_CONSENT_LABEL,
} from "./researchConsent";

describe("Firecrawl consent copy", () => {
  it("discloses both metered discovery and local-crawler fallback", () => {
    expect(FIRECRAWL_CONSENT_LABEL).toContain("discovery and fallback");
    expect(FIRECRAWL_CONSENT_HELP).toContain("metered cost for competitor web search");
    expect(FIRECRAWL_CONSENT_HELP).toContain("local crawler fails");
  });
});
