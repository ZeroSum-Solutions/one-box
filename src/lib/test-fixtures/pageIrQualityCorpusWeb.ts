import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { capturePageIrBrowserEvidence } from "../../../scripts/eval/page-ir-harness-browser.mjs";
import type { PagePurposeV1 } from "../contracts";
import { materializePageIrQualityFixture } from "./pageIrQualityCorpus";

export const QUALITY_CORPUS_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "mobile", width: 390, height: 844 },
] as const;

export function qualityCorpusInputsRoot(): string {
  const sealedRoot = process.env.ONEBOX_EVAL_INPUTS_ROOT;
  if (process.env.ONEBOX_EVAL_OFFLINE === "1" && !sealedRoot) {
    throw new Error("credential-free corpus evaluation requires sealed prepared inputs");
  }
  return sealedRoot ?? path.join(
    process.cwd(),
    "docs/eval/page-ir-safe-pipeline/fixtures",
  );
}

export async function capturePageIrQualityFixture(
  fixtureId: PagePurposeV1,
  qualificationChecks: boolean,
) {
  if (process.env.ONEBOX_EVAL_OFFLINE === "1") {
    const browserRoot = process.env.ONEBOX_EVAL_BROWSER_ROOT;
    if (!browserRoot) {
      throw new Error("credential-free corpus evaluation requires sealed browser evidence");
    }
    const packetRoot = path.join(browserRoot, fixtureId);
    const evidence = JSON.parse(
      await readFile(path.join(packetRoot, "browser-evidence.json"), "utf8"),
    ) as Awaited<ReturnType<typeof capturePageIrBrowserEvidence>>["evidence"];
    if (qualificationChecks && evidence.qualificationChecks !== true) {
      throw new Error(`sealed browser evidence lacks qualification checks: ${fixtureId}`);
    }
    return {
      materialized: { siteRoot: "" },
      packet: { packetRoot, evidencePath: path.join(packetRoot, "browser-evidence.json"), evidence },
      disposable: false,
    };
  }
  const siteRoot = await mkdtemp(path.join(tmpdir(), "onebox-page-ir-quality-site-"));
  let packet: Awaited<ReturnType<typeof capturePageIrBrowserEvidence>> | undefined;
  try {
    const materialized = await materializePageIrQualityFixture(
      fixtureId,
      siteRoot,
      qualityCorpusInputsRoot(),
    );
    packet = await capturePageIrBrowserEvidence({
      siteRoot,
      viewports: QUALITY_CORPUS_VIEWPORTS,
      coreContentSelectors: materialized.fixture.brief.expectedCoreSelectors,
      primaryActionSelectors: materialized.fixture.brief.expectedActionSelectors,
      ...(qualificationChecks ? { qualificationChecks: true } : {}),
    });
    return { materialized, packet, disposable: true };
  } catch (error) {
    await fsCleanup(packet?.packetRoot, siteRoot);
    throw error;
  }
}

export function pageIrEvidenceCapture(
  evidence: Awaited<ReturnType<typeof capturePageIrBrowserEvidence>>["evidence"],
  id: string,
) {
  const capture = evidence.captures.find((entry) => entry.id === id);
  if (!capture) throw new Error(`browser evidence is missing capture ${id}`);
  return capture;
}

export async function disposePageIrQualityCapture(capture: {
  packet: { packetRoot: string };
  materialized: { siteRoot: string };
  disposable: boolean;
}): Promise<void> {
  if (!capture.disposable) return;
  await fsCleanup(capture.packet.packetRoot, capture.materialized.siteRoot);
}

async function fsCleanup(...roots: Array<string | undefined>): Promise<void> {
  await Promise.all(
    roots.filter((root): root is string => typeof root === "string")
      .map((root) => rm(root, { recursive: true, force: true })),
  );
}
