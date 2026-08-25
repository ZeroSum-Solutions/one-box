import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { capturePageIrBrowserEvidence } from "../../../scripts/eval/page-ir-harness-browser.mjs";
import type { PagePurposeV1 } from "../contracts";
import { compilePageIRV1 } from "../pageIrCompiler";
import {
  loadPageIrQualityFixture,
  materializePageIrQualityFixture,
} from "./pageIrQualityCorpus";

export const QUALITY_CORPUS_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "mobile", width: 390, height: 844 },
] as const;

const READ_FLAGS = constants.O_RDONLY |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0);
const MAX_PACKET_LOCK_BYTES = 256 * 1024;
const MAX_BROWSER_EVIDENCE_BYTES = 5 * 1024 * 1024;

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readBoundedRegularFile(
  filePath: string,
  maxBytes: number,
  label: string,
): Promise<Buffer> {
  const initial = await lstat(filePath, { bigint: true });
  if (
    initial.isSymbolicLink() ||
    !initial.isFile() ||
    initial.nlink > BigInt(1) ||
    initial.size > BigInt(maxBytes)
  ) {
    throw new Error(`unsafe ${label}`);
  }
  const handle = await open(filePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      !sameFile(initial, opened) ||
      opened.size !== initial.size ||
      opened.size > BigInt(maxBytes)
    ) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) throw new Error(`${label} changed while read`);
      offset += result.bytesRead;
    }
    const probe = Buffer.alloc(1);
    if ((await handle.read(probe, 0, 1, bytes.length)).bytesRead !== 0) {
      throw new Error(`${label} changed while read`);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || after.size !== opened.size) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

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

async function readLockedBrowserEvidence(
  packetRoot: string,
  fixtureId: PagePurposeV1,
) {
  try {
    const lockPath = path.join(packetRoot, "packet.lock.json");
    const lock = JSON.parse(
      (await readBoundedRegularFile(
        lockPath,
        MAX_PACKET_LOCK_BYTES,
        "packet lock",
      )).toString("utf8"),
    ) as {
      schemaVersion?: unknown;
      name?: unknown;
      files?: unknown;
    };
    const files = Array.isArray(lock.files) ? lock.files : [];
    const evidenceBinding = files.find((entry) =>
      entry && typeof entry === "object" &&
      (entry as { path?: unknown }).path === "browser-evidence.json"
    ) as { path?: unknown; sizeBytes?: unknown; sha256?: unknown } | undefined;
    if (
      lock.schemaVersion !== 1 ||
      lock.name !== fixtureId ||
      !evidenceBinding ||
      !Number.isSafeInteger(evidenceBinding.sizeBytes) ||
      typeof evidenceBinding.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(evidenceBinding.sha256)
    ) {
      throw new Error("invalid packet lock");
    }
    const evidencePath = path.join(packetRoot, "browser-evidence.json");
    const evidenceBytes = await readBoundedRegularFile(
      evidencePath,
      MAX_BROWSER_EVIDENCE_BYTES,
      "evidence file",
    );
    if (evidenceBytes.byteLength !== evidenceBinding.sizeBytes) {
      throw new Error("invalid evidence file");
    }
    if (
      createHash("sha256").update(evidenceBytes).digest("hex") !==
      evidenceBinding.sha256
    ) {
      throw new Error("evidence hash mismatch");
    }
    return evidenceBytes;
  } catch (error) {
    throw new Error(`sealed browser evidence packet lock is invalid: ${fixtureId}`, {
      cause: error,
    });
  }
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
      (await readLockedBrowserEvidence(packetRoot, fixtureId)).toString("utf8"),
    ) as Awaited<ReturnType<typeof capturePageIrBrowserEvidence>>["evidence"];
    const inputsRoot = qualityCorpusInputsRoot();
    const fixture = await loadPageIrQualityFixture(fixtureId, inputsRoot);
    const fixtureManifestSha256 = createHash("sha256").update(
      await readFile(path.join(inputsRoot, fixtureId, "fixture.json")),
    ).digest("hex");
    const buildSha256 = compilePageIRV1({
      schemaVersion: 1,
      pageIr: fixture.pageIr,
      assets: [],
    }).manifest.buildSha256;
    if (
      evidence.schemaVersion !== 1 ||
      evidence.fixtureBinding?.fixtureId !== fixtureId ||
      evidence.fixtureBinding?.fixtureManifestSha256 !== fixtureManifestSha256 ||
      evidence.fixtureBinding?.buildSha256 !== buildSha256
    ) {
      throw new Error(`sealed browser evidence fixture binding is invalid: ${fixtureId}`);
    }
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
