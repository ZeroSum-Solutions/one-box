import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { capturePageIrQualityFixture } from "./pageIrQualityCorpusWeb";
import { compilePageIRV1 } from "../pageIrCompiler";
import { loadPageIrQualityFixture } from "./pageIrQualityCorpus";

const temporaryRoots: string[] = [];
const originalOffline = process.env.ONEBOX_EVAL_OFFLINE;
const originalBrowserRoot = process.env.ONEBOX_EVAL_BROWSER_ROOT;
const originalInputsRoot = process.env.ONEBOX_EVAL_INPUTS_ROOT;

afterEach(async () => {
  if (originalOffline === undefined) delete process.env.ONEBOX_EVAL_OFFLINE;
  else process.env.ONEBOX_EVAL_OFFLINE = originalOffline;
  if (originalBrowserRoot === undefined) delete process.env.ONEBOX_EVAL_BROWSER_ROOT;
  else process.env.ONEBOX_EVAL_BROWSER_ROOT = originalBrowserRoot;
  if (originalInputsRoot === undefined) delete process.env.ONEBOX_EVAL_INPUTS_ROOT;
  else process.env.ONEBOX_EVAL_INPUTS_ROOT = originalInputsRoot;
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("offline Page IR corpus browser evidence", () => {
  it("rejects an oversized packet lock before allocating or parsing it", async () => {
    const browserRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "one-box-offline-browser-oversize-"),
    );
    temporaryRoots.push(browserRoot);
    const fixtureId = "brochure-local-service";
    const packetRoot = path.join(browserRoot, fixtureId);
    await fs.mkdir(packetRoot, { recursive: true });
    const lockPath = path.join(packetRoot, "packet.lock.json");
    await fs.writeFile(lockPath, "{}");
    await fs.truncate(lockPath, 256 * 1024 + 1);
    process.env.ONEBOX_EVAL_OFFLINE = "1";
    process.env.ONEBOX_EVAL_BROWSER_ROOT = browserRoot;
    process.env.ONEBOX_EVAL_INPUTS_ROOT = path.join(
      process.cwd(),
      "docs/eval/page-ir-safe-pipeline/fixtures",
    );

    await expect(
      capturePageIrQualityFixture(fixtureId, true),
    ).rejects.toThrow(/packet lock|sealed browser evidence/i);
  });

  it("rejects evidence whose fixture binding does not match the sealed input", async () => {
    const browserRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "one-box-offline-browser-evidence-"),
    );
    temporaryRoots.push(browserRoot);
    const packetRoot = path.join(browserRoot, "brochure-local-service");
    await fs.mkdir(packetRoot, { recursive: true });
    await fs.writeFile(
      path.join(packetRoot, "browser-evidence.json"),
      JSON.stringify({
        schemaVersion: 1,
        fixtureBinding: {
          fixtureId: "institutional-presence",
          fixtureManifestSha256: "a".repeat(64),
          buildSha256: "b".repeat(64),
        },
        qualificationChecks: true,
        captures: [],
      }),
    );
    process.env.ONEBOX_EVAL_OFFLINE = "1";
    process.env.ONEBOX_EVAL_BROWSER_ROOT = browserRoot;
    process.env.ONEBOX_EVAL_INPUTS_ROOT = path.join(
      process.cwd(),
      "docs/eval/page-ir-safe-pipeline/fixtures",
    );

    await expect(
      capturePageIrQualityFixture("brochure-local-service", true),
    ).rejects.toThrow(/sealed browser evidence|fixture binding/i);
  });

  it("rejects browser evidence changed after its packet lock was sealed", async () => {
    const inputsRoot = path.join(
      process.cwd(),
      "docs/eval/page-ir-safe-pipeline/fixtures",
    );
    const fixtureId = "brochure-local-service";
    const fixture = await loadPageIrQualityFixture(fixtureId, inputsRoot);
    const fixtureManifestSha256 = createHash("sha256").update(
      await fs.readFile(path.join(inputsRoot, fixtureId, "fixture.json")),
    ).digest("hex");
    const buildSha256 = compilePageIRV1({
      schemaVersion: 1,
      pageIr: fixture.pageIr,
      assets: [],
    }).manifest.buildSha256;
    const browserRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "one-box-offline-browser-lock-"),
    );
    temporaryRoots.push(browserRoot);
    const packetRoot = path.join(browserRoot, fixtureId);
    await fs.mkdir(packetRoot, { recursive: true });
    const evidencePath = path.join(packetRoot, "browser-evidence.json");
    const originalEvidence = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      fixtureBinding: { fixtureId, fixtureManifestSha256, buildSha256 },
      qualificationChecks: true,
      captures: [],
    }));
    await fs.writeFile(evidencePath, originalEvidence);
    await fs.writeFile(
      path.join(packetRoot, "packet.lock.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: fixtureId,
        files: [{
          path: "browser-evidence.json",
          sizeBytes: originalEvidence.length,
          sha256: createHash("sha256").update(originalEvidence).digest("hex"),
        }],
      }),
    );
    await fs.writeFile(
      evidencePath,
      Buffer.concat([originalEvidence, Buffer.from("\n")]),
    );
    process.env.ONEBOX_EVAL_OFFLINE = "1";
    process.env.ONEBOX_EVAL_BROWSER_ROOT = browserRoot;
    process.env.ONEBOX_EVAL_INPUTS_ROOT = inputsRoot;

    await expect(
      capturePageIrQualityFixture(fixtureId, true),
    ).rejects.toThrow(/packet lock|sealed browser evidence/i);
  });
});
