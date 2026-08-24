import { describe, expect, it } from "vitest";
import { QUALITY_CORPUS_FIXTURE_IDS } from "./test-fixtures/pageIrQualityCorpus";
import {
  capturePageIrQualityFixture,
  disposePageIrQualityCapture,
  pageIrEvidenceCapture,
  QUALITY_CORPUS_VIEWPORTS,
} from "./test-fixtures/pageIrQualityCorpusWeb";

describe("EVAL-WEB-002 responsive layout and accessibility", () => {
  it.each(QUALITY_CORPUS_FIXTURE_IDS)(
    "%s passes frozen viewport, keyboard, accessibility, contrast, and reduced-motion checks",
    async (fixtureId) => {
      const capture = await capturePageIrQualityFixture(fixtureId, true);
      try {
        expect(capture.packet.evidence.viewports).toEqual(QUALITY_CORPUS_VIEWPORTS);
        for (const viewport of QUALITY_CORPUS_VIEWPORTS) {
          const rendered = pageIrEvidenceCapture(
            capture.packet.evidence,
            viewport.id,
          );
          expect(rendered.qualification.horizontalOverflow).toBe(false);
          expect(rendered.qualification.overflowingElements).toEqual([]);
          expect(rendered.qualification.keyboard.unreachedSelectors).toEqual([]);
          expect(rendered.qualification.accessibility.seriousOrCritical).toEqual([]);
          expect(rendered.qualification.accessibility.colorContrast).toEqual([]);
        }
        const reducedMotion = pageIrEvidenceCapture(
          capture.packet.evidence,
          "reduced-motion",
        );
        expect(reducedMotion.qualification.reducedMotion).toEqual({
          matches: true,
          allMotionDisabled: true,
          activeMotion: [],
        });
      } finally {
        await disposePageIrQualityCapture(capture);
      }
    },
    30_000,
  );
});
