import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GUIDANCE_PROMPTS,
  IntakeComposer,
  boundedComposerHeight,
} from "./IntakeComposer";

const research = {
  enabled: true,
  businessIntelligence: true,
  referoDesignEvidence: true,
  allowPaidFirecrawlFallback: false,
};

function renderComposer(referoDesignEvidenceAvailable = true) {
  return renderToStaticMarkup(
    <IntakeComposer
      value=""
      onChange={() => undefined}
      onSubmit={() => undefined}
      projectTarget="website"
      research={research}
      uploads={[]}
      uploadSession={null}
      onProjectTargetChange={() => undefined}
      onResearchChange={() => undefined}
      onUploadsChange={() => undefined}
      onUploadSessionChange={() => undefined}
      referoDesignEvidenceAvailable={referoDesignEvidenceAvailable}
      referoConnectUrl="/api/refero/connect"
    />
  );
}

describe("IntakeComposer", () => {
  it("renders one prompt surface with exactly three persistent actions", () => {
    const html = renderComposer();
    expect(html).toContain('class="intake-composer"');
    expect(html).toContain('aria-label="Describe your project"');
    expect(html).toContain('rows="6"');
    expect(html).toContain('aria-label="Add files"');
    expect(html).toContain('class="intake-target__summary"');
    expect(html).toContain('class="btn-primary intake-composer__send"');
    expect(html).not.toContain("Describe the business.");
    expect(html).not.toContain('class="hero-display"');
  });

  it("keeps target outcomes, tooling context, and paid research consent in progressive disclosure", () => {
    const html = renderComposer();
    expect(html).toContain("A responsive public-facing site for marketing, information, lead generation, or sales.");
    expect(html).toContain("Next.js and Tailwind CSS");
    expect(html).not.toContain("Web app");
    expect(html).not.toContain("iOS");
    expect(html.match(/name="project-target"/g)).toHaveLength(1);
    expect(html).toContain("Research settings");
    expect(html).toContain("Gather the research lanes selected below before the build.");
    expect(html).toContain("Business and competitor context");
    expect(html).toContain(
      "Runs only when paid Firecrawl discovery is separately approved below."
    );
    expect(html).toContain("Allow paid Firecrawl discovery and fallback");
    expect(html).toContain(
      "Competitor discovery will be skipped unless paid Firecrawl discovery is approved."
    );
    expect(html).toContain("Website selected. Describe the company, audience, pages, and action you want visitors to take.");
  });

  it("disables unavailable Refero evidence before a prompt can create a blocked run", () => {
    const html = renderComposer(false);
    expect(html).toContain("Design-reference evidence");
    expect(html).toContain("Connect Refero");
    expect(html).toContain('href="/api/refero/connect"');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*name="refero-design-evidence"/);
  });

  it("uses the approved guidance set and bounds textarea growth to the viewport", () => {
    expect(GUIDANCE_PROMPTS).toEqual([
      "Tell us about the company you run or want to build.",
      "Share anything that will help us understand it.",
      "Website is the production target for Phase 1.",
      "Try Research to sharpen the result.",
      "Add any files you want us to use.",
    ]);
    expect(boundedComposerHeight(80, 900)).toEqual({ height: 144, overflow: false });
    expect(boundedComposerHeight(700, 900)).toEqual({ height: 360, overflow: true });
    expect(boundedComposerHeight(700, 320)).toEqual({ height: 160, overflow: true });
  });
});
