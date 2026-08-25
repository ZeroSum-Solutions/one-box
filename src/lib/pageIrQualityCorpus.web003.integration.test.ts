import { describe, expect, it } from "vitest";
import { QUALITY_CORPUS_FIXTURE_IDS } from "./test-fixtures/pageIrQualityCorpus";
import {
  capturePageIrQualityFixture,
  disposePageIrQualityCapture,
  pageIrEvidenceCapture,
  QUALITY_CORPUS_VIEWPORTS,
} from "./test-fixtures/pageIrQualityCorpusWeb";

const TOTAL_TRANSFER_LIMIT = 900 * 1024;
const IMAGE_TRANSFER_LIMIT = 500 * 1024;
const DOM_CONTENT_LOADED_LIMIT_MS = 2_000;

describe.skipIf(process.platform !== "darwin" || process.arch !== "arm64")(
  "EVAL-WEB-003 assets, console, and performance gates",
  () => {
    it.each(QUALITY_CORPUS_FIXTURE_IDS)(
      "%s has no hidden remote dependency and meets the blocking 4x performance budget",
      async (fixtureId) => {
        const capture = await capturePageIrQualityFixture(fixtureId, true);
        try {
          expect(capture.packet.evidence.providerCalls).toBe(0);
          expect(capture.packet.evidence.attemptedExternalUrls).toEqual([]);
          expect(capture.packet.evidence.rejectedStaticRequests).toEqual([]);
          for (const rendered of capture.packet.evidence.captures) {
            expect(rendered.blockedRequests).toEqual([]);
            expect(rendered.consoleErrors).toEqual([]);
            expect(rendered.pageErrors).toEqual([]);
            expect(rendered.localResourceFailures).toEqual([]);
            expect(rendered.serviceWorkerRegistrations).toBe(0);
          }
          for (const viewport of QUALITY_CORPUS_VIEWPORTS) {
            const rendered = pageIrEvidenceCapture(
              capture.packet.evidence,
              viewport.id,
            );
            expect(rendered.metrics.cpuThrottleRate).toBe(4);
            expect(rendered.metrics.totalTransferBytes).toBeLessThan(TOTAL_TRANSFER_LIMIT);
            expect(rendered.metrics.imageTransferBytes).toBeLessThan(IMAGE_TRANSFER_LIMIT);
            expect(rendered.metrics.domContentLoadedMs).toBeGreaterThanOrEqual(0);
            expect(rendered.metrics.domContentLoadedMs).toBeLessThan(
              DOM_CONTENT_LOADED_LIMIT_MS,
            );
          }
        } finally {
          await disposePageIrQualityCapture(capture);
        }
      },
      30_000,
    );
  },
);
