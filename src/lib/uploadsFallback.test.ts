import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ARTIFACTS, IntakeSchema, type UploadMetadata } from "./contracts";
import {
  createRun,
  createTemplateFallbackRun,
  failStage,
  loadArtifact,
  loadRun,
  saveArtifact,
  sitePaths,
} from "./runstate";
import {
  cloneClaimedUploadsForFallback,
  type RunUploadManifest,
} from "./uploads";

const runIds: string[] = [];
const storedName = "11111111-1111-4111-8111-111111111111.txt";
const sourceBytes = Buffer.from("verified fallback upload");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function run(): Promise<string> {
  const runId = await createRun({ pipelineVersion: "legacy-v1" });
  runIds.push(runId);
  return runId;
}

function metadata(overrides: Partial<UploadMetadata> = {}): UploadMetadata {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "brief.txt",
    kind: "copy-document",
    mediaType: "text/plain",
    sizeBytes: sourceBytes.byteLength,
    uploadedAt: "2026-08-23T00:00:00.000Z",
    sha256: sha256(sourceBytes),
    storagePath: `uploads/${storedName}`,
    ...overrides,
  };
}

async function installClaimedSource(
  runId: string,
  file = metadata(),
): Promise<void> {
  const directory = sitePaths(runId).uploads;
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(path.join(directory, storedName), sourceBytes, { mode: 0o600 });
  const manifest: RunUploadManifest = {
    version: 1,
    sessionId: "33333333-3333-4333-8333-333333333333",
    state: "claimed",
    claimedAt: "2026-08-23T00:00:01.000Z",
    files: [file as Required<UploadMetadata>],
  };
  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("fallback claimed upload clone", () => {
  it("rebinds verified claimed uploads into the fallback child's intake", async () => {
    const source = await createRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
      pipelineVersion: "legacy-v1",
    });
    runIds.push(source);
    const expected = metadata();
    await installClaimedSource(source, expected);
    await saveArtifact(source, ARTIFACTS.intake, IntakeSchema.parse({
      businessName: "Upload Source",
      category: "consulting",
      location: "Portland, OR",
      services: ["Advisory"],
      primaryAction: "quote",
      uploads: [expected],
    }));
    await failStage(source, "built", "compiler failed");

    const child = await createTemplateFallbackRun(
      source,
      "page-ir-compilation-failed",
    );
    runIds.push(child);
    const childIntake = IntakeSchema.parse(
      await loadArtifact(child, ARTIFACTS.intake),
    );
    expect(childIntake.uploads).toEqual([expected]);
    expect(await fs.readFile(path.join(sitePaths(child).uploads, storedName))).toEqual(
      sourceBytes,
    );
  });

  it("leaves a failed source unlinked when a claimed upload is tampered", async () => {
    const source = await createRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
      pipelineVersion: "legacy-v1",
    });
    runIds.push(source);
    const expected = metadata();
    await installClaimedSource(source, expected);
    await fs.writeFile(
      path.join(sitePaths(source).uploads, storedName),
      "tampered",
    );
    await saveArtifact(source, ARTIFACTS.intake, IntakeSchema.parse({
      businessName: "Upload Source",
      category: "consulting",
      location: "Portland, OR",
      services: ["Advisory"],
      primaryAction: "quote",
      uploads: [expected],
    }));
    await failStage(source, "built", "compiler failed");

    await expect(
      createTemplateFallbackRun(source, "page-ir-compilation-failed"),
    ).rejects.toThrow(/integrity/i);
    const persisted = await loadRun(source);
    if (persisted.templateFallback) runIds.push(persisted.templateFallback.childRunId);
    expect(persisted.templateFallback).toBeUndefined();
    await expect(
      fs.stat(path.join(sitePaths(source).root, ".template-fallback-claim.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("copies verified bytes atomically and is idempotent", async () => {
    const source = await run();
    const child = await run();
    const expected = metadata();
    await installClaimedSource(source, expected);

    await expect(
      Promise.all([
        cloneClaimedUploadsForFallback(source, child, [expected]),
        cloneClaimedUploadsForFallback(source, child, [expected]),
      ]),
    ).resolves.toEqual([[expected], [expected]]);
    expect(await fs.readFile(path.join(sitePaths(child).uploads, storedName))).toEqual(
      sourceBytes,
    );
    expect((await fs.readdir(sitePaths(child).root)).filter((entry) =>
      entry.includes("uploads.fallback"),
    )).toEqual([]);
  });

  it.each([
    ["path", { storagePath: "uploads/../escape.txt" }],
    ["size", { sizeBytes: sourceBytes.byteLength + 1 }],
    ["hash", { sha256: "f".repeat(64) }],
  ] as const)("rejects claimed %s abuse without a partial child directory", async (_case, override) => {
    const source = await run();
    const child = await run();
    const claimed = metadata(override);
    await installClaimedSource(source, claimed);

    await expect(
      cloneClaimedUploadsForFallback(source, child, [claimed]),
    ).rejects.toThrow(/(path|integrity)/i);
    await expect(fs.stat(sitePaths(child).uploads)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["symlink", "hardlink"] as const)(
    "rejects a %s source blob without copying it",
    async (kind) => {
      const source = await run();
      const child = await run();
      const expected = metadata();
      await installClaimedSource(source, expected);
      const blob = path.join(sitePaths(source).uploads, storedName);
      const original = `${blob}.original`;
      await fs.rename(blob, original);
      if (kind === "symlink") await fs.symlink(original, blob);
      else await fs.link(original, blob);

      await expect(
        cloneClaimedUploadsForFallback(source, child, [expected]),
      ).rejects.toThrow(/safe regular file/i);
      await expect(fs.stat(sitePaths(child).uploads)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );
});
