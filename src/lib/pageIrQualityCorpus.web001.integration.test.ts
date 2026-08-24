import { describe, expect, it } from "vitest";
import { QUALITY_CORPUS_FIXTURE_IDS } from "./test-fixtures/pageIrQualityCorpus";
import {
  capturePageIrQualityFixture,
  disposePageIrQualityCapture,
  pageIrEvidenceCapture,
} from "./test-fixtures/pageIrQualityCorpusWeb";

describe("EVAL-WEB-001 static and no-JavaScript website contract", () => {
  it.each(QUALITY_CORPUS_FIXTURE_IDS)(
    "%s preserves core content, navigation, and primary actions without JavaScript",
    async (fixtureId) => {
      const capture = await capturePageIrQualityFixture(fixtureId, false);
      try {
        const noJs = pageIrEvidenceCapture(capture.packet.evidence, "no-js");
        expect(noJs.javascriptEnabled).toBe(false);
        expect(noJs.navigation.status).toBe(200);
        expect(noJs.navigation.links.length).toBeGreaterThan(0);
        expect(noJs.coreContent.every((entry) =>
          entry.present && entry.visible && entry.text.length > 0
        )).toBe(true);
        expect(noJs.primaryActions.every((entry) =>
          entry.present && entry.visible && Boolean(entry.href) && entry.text.length > 0
        )).toBe(true);
        expect(noJs.consoleErrors).toEqual([]);
        expect(noJs.pageErrors).toEqual([]);
      } finally {
        await disposePageIrQualityCapture(capture);
      }
    },
    30_000,
  );
});
