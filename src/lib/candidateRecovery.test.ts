import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  candidateManifestSha256,
  createCandidateManifest,
  recoverCandidateState,
  transitionCandidateProvenance,
} from "./candidate";
import {
  CandidateProvenanceV1Schema,
  type CandidateProvenanceV1,
} from "./contracts";
import { candidatePaths, createRun, sitePaths } from "./runstate";

const runIds: string[] = [];
const inputBytes = Buffer.from('{"fixture":"candidate-recovery"}\n');

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createTestRun(prefix: string): Promise<string> {
  const runId = `${prefix}-${process.pid}-${runIds.length}`;
  runIds.push(runId);
  await createRun({ id: runId, pipelineVersion: "legacy-v1" });
  await fs.writeFile(path.join(sitePaths(runId).root, "intake.json"), inputBytes);
  return runId;
}

function preparing(runId: string): CandidateProvenanceV1 {
  return CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: "candidate-v1",
    runId,
    createdAt: "2026-08-23T00:00:00.000Z",
    state: "preparing",
    history: [{ state: "preparing", at: "2026-08-23T00:00:00.000Z" }],
    inputArtifactHashes: [{ path: "intake.json", sha256: sha256(inputBytes) }],
    layoutAuthority: "template-v1",
    compilerVersion: "fixture-v1",
  });
}

async function writeCandidateBundle(
  runId: string,
  root: string,
  state: "ready-for-gates" | "failed" | "promotable" | "abandoned",
): Promise<void> {
  const site = path.join(root, "site");
  await fs.mkdir(site, { recursive: true });
  await fs.writeFile(path.join(site, "index.html"), `candidate-${state}`);
  const manifest = await createCandidateManifest(site);
  await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  let provenance = transitionCandidateProvenance(
    preparing(runId),
    "ready-for-gates",
    "2026-08-23T00:00:01.000Z",
    {
      candidateManifestSha256: candidateManifestSha256(manifest),
      buildSha256: manifest.buildSha256,
    },
  );
  if (state === "failed") {
    provenance = transitionCandidateProvenance(
      provenance,
      "failed",
      "2026-08-23T00:00:02.000Z",
    );
  } else if (state === "promotable") {
    const receipt = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      runId,
      candidateManifestSha256: candidateManifestSha256(manifest),
      buildSha256: manifest.buildSha256,
      reports: [
        { gate: "token-drift", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "color-role-compliance", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "axe", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "contrast", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "console-errors", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "assets", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "no-js", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "mobile-layout", pass: true, blocking: true, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
        { gate: "perf-budget", pass: true, blocking: false, details: [], ranAt: "2026-08-23T00:00:02.000Z" },
      ],
    }, null, 2));
    await fs.writeFile(path.join(root, "gates.json"), receipt);
    provenance = transitionCandidateProvenance(
      provenance,
      "promotable",
      "2026-08-23T00:00:02.000Z",
      { gateReportSha256: sha256(receipt) },
    );
  } else if (state === "abandoned") {
    provenance = transitionCandidateProvenance(
      provenance,
      "abandoned",
      "2026-08-23T00:00:02.000Z",
    );
  }
  await fs.writeFile(path.join(root, "provenance.json"), JSON.stringify(provenance, null, 2));
}

afterEach(async () => {
  await Promise.all(runIds.splice(0).map((runId) =>
    fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
  ));
});

describe("candidate crash recovery", () => {
  it.each([
    ["ready-for-gates", "resume-gates"],
    ["failed", "retain-failed"],
    ["promotable", "retain-promotable"],
    ["abandoned", "retain-abandoned"],
  ] as const)("maps a valid %s candidate to %s without changing live bytes", async (state, action) => {
    const runId = await createTestRun(`recover-${state}`);
    const paths = candidatePaths(runId);
    await writeCandidateBundle(runId, paths.root, state);
    await fs.mkdir(sitePaths(runId).site, { recursive: true });
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "last-known-good");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({ action, state });
    expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"), "utf8"))
      .toBe("last-known-good");
    if (state === "promotable") {
      expect((await fs.readdir(sitePaths(runId).root)).filter((entry) =>
        /^\.site-promotion-(?:stage|retired)-/.test(entry)
      )).toEqual([]);
      expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
        state: "promotable",
      });
    }
  });

  it("abandons an interrupted preparing candidate and persists a bounded recovery reason", async () => {
    const runId = await createTestRun("recover-preparing");
    const paths = candidatePaths(runId);
    await fs.mkdir(paths.site, { recursive: true });
    await fs.writeFile(path.join(paths.site, "partial.txt"), "partial");
    await fs.writeFile(paths.provenance, JSON.stringify(preparing(runId), null, 2));

    const result = await recoverCandidateState(runId);

    expect(result).toMatchObject({ action: "abandoned", state: "abandoned" });
    expect(result.reason).toMatch(/preparing/i);
    expect(result.reason!.length).toBeLessThanOrEqual(240);
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "abandoned",
    });
    expect(JSON.parse(await fs.readFile(path.join(sitePaths(runId).root, "candidate-recovery.json"), "utf8")))
      .toMatchObject({ action: "abandoned", reason: result.reason });
  });

  it("abandons a hash-invalid resumable candidate without changing the live site", async () => {
    const runId = await createTestRun("recover-invalid-ready");
    const paths = candidatePaths(runId);
    await writeCandidateBundle(runId, paths.root, "ready-for-gates");
    await fs.writeFile(path.join(paths.site, "index.html"), "tampered-candidate");
    await fs.mkdir(sitePaths(runId).site, { recursive: true });
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "last-known-good");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "abandoned",
      state: "abandoned",
      reason: expect.stringMatching(/mismatch|invalid|candidate/i),
    });
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "abandoned",
    });
    expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"), "utf8"))
      .toBe("last-known-good");
  });

  it("abandons a resumable candidate when a bound run input changed", async () => {
    const runId = await createTestRun("recover-stale-input");
    const paths = candidatePaths(runId);
    await writeCandidateBundle(runId, paths.root, "ready-for-gates");
    await fs.writeFile(path.join(sitePaths(runId).root, "intake.json"), "changed-input");
    await fs.mkdir(sitePaths(runId).site, { recursive: true });
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "last-known-good");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "abandoned",
      state: "abandoned",
      reason: expect.stringMatching(/input|SHA-256|stale/i),
    });
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "abandoned",
    });
    expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"), "utf8"))
      .toBe("last-known-good");
    expect(JSON.parse(await fs.readFile(
      path.join(sitePaths(runId).root, "candidate-recovery.json"),
      "utf8",
    ))).toMatchObject({ action: "abandoned", state: "abandoned" });
  });

  it("resumes one complete build staging bundle only when its hashes validate", async () => {
    const runId = await createTestRun("recover-building");
    const staging = `${candidatePaths(runId).root}.building-crash`;
    await writeCandidateBundle(runId, staging, "ready-for-gates");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "resume-gates",
      state: "ready-for-gates",
    });
    expect(await fs.readFile(path.join(candidatePaths(runId).site, "index.html"), "utf8"))
      .toBe("candidate-ready-for-gates");
    await expect(fs.stat(staging)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes closed orphan transaction roots after a valid canonical candidate wins", async () => {
    const runId = await createTestRun("recover-canonical-wins");
    const canonical = candidatePaths(runId);
    const orphan = `${canonical.root}.building-orphan`;
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates");
    await writeCandidateBundle(runId, orphan, "ready-for-gates");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "resume-gates",
      state: "ready-for-gates",
    });
    await expect(fs.stat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "resume-gates",
      state: "ready-for-gates",
    });
    expect((await fs.readdir(sitePaths(runId).root)).filter((entry) =>
      /^candidate\.(?:building|repairing|repair-backup|retired)-/.test(entry)
    )).toEqual([]);
  });

  it("restores the retired live site after a crash before replacement and never serves staging", async () => {
    const runId = await createTestRun("recover-promotion-retired");
    const roots = sitePaths(runId);
    const retired = path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe");
    const staging = path.join(roots.root, ".site-promotion-stage-123-deadbeefcafe");
    await fs.mkdir(retired, { recursive: true });
    await fs.writeFile(path.join(retired, "index.html"), "last-known-good");
    const retiredEntriesBefore = await fs.readdir(retired);
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, "index.html"), "uncommitted-new-site");

    const result = await recoverCandidateState(runId);

    expect(result.action).toBe("absent");
    expect(await fs.readFile(path.join(roots.site, "index.html"), "utf8"))
      .toBe("last-known-good");
    expect(await fs.readdir(roots.site)).toEqual(retiredEntriesBefore);
    await expect(fs.stat(staging)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(retired)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks and preserves a matching retired symlink instead of installing it as live", async () => {
    const runId = await createTestRun("recover-retired-symlink");
    const roots = sitePaths(runId);
    const operatorData = path.join(roots.root, "operator-last-known-good");
    const retired = path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe");
    await fs.mkdir(operatorData);
    await fs.writeFile(path.join(operatorData, "index.html"), "operator-data");
    await fs.symlink(operatorData, retired);

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringMatching(/retired|directory|symlink/i),
    });
    expect((await fs.lstat(retired)).isSymbolicLink()).toBe(true);
    await expect(fs.lstat(roots.site)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(operatorData, "index.html"), "utf8"))
      .toBe("operator-data");
  });

  it("rolls back an exact live replacement when candidate provenance was not committed", async () => {
    const runId = await createTestRun("recover-live-replaced");
    const roots = sitePaths(runId);
    const candidate = candidatePaths(runId);
    await writeCandidateBundle(runId, candidate.root, "promotable");
    const manifestBytes = await fs.readFile(candidate.manifest);
    const receiptBytes = await fs.readFile(candidate.gates);
    const provenance = CandidateProvenanceV1Schema.parse(
      JSON.parse(await fs.readFile(candidate.provenance, "utf8")),
    );
    const promoted = transitionCandidateProvenance(
      provenance,
      "promoted",
      "2026-08-23T00:00:03.000Z",
      { promotedBuildSha256: provenance.buildSha256 },
    );
    await fs.cp(candidate.site, roots.site, { recursive: true });
    await fs.mkdir(path.join(roots.site, ".one-box"));
    await fs.writeFile(path.join(roots.site, ".one-box", "candidate-manifest.json"), manifestBytes);
    await fs.writeFile(path.join(roots.site, ".one-box", "provenance.json"), JSON.stringify(promoted, null, 2));
    await fs.writeFile(path.join(roots.site, ".one-box", "gates.json"), receiptBytes);
    const retired = path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe");
    await fs.mkdir(retired);
    await fs.writeFile(path.join(retired, "index.html"), "last-known-good");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "retain-promotable",
      state: "promotable",
    });
    expect(await fs.readFile(path.join(roots.site, "index.html"), "utf8"))
      .toBe("last-known-good");
    expect(JSON.parse(await fs.readFile(candidate.provenance, "utf8"))).toMatchObject({
      state: "promotable",
    });
    await expect(fs.stat(retired)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks and preserves a retired generation when current live bytes are not a coherent promoted bundle", async () => {
    const runId = await createTestRun("recover-edited-live");
    const roots = sitePaths(runId);
    const retired = path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe");
    await fs.mkdir(retired, { recursive: true });
    await fs.writeFile(path.join(retired, "index.html"), "last-known-good");
    await fs.mkdir(roots.site, { recursive: true });
    await fs.writeFile(path.join(roots.site, "index.html"), "later-edited-live");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringMatching(/retired|coherent|ambiguous/i),
    });
    expect(await fs.readFile(path.join(roots.site, "index.html"), "utf8"))
      .toBe("later-edited-live");
    expect(await fs.readFile(path.join(retired, "index.html"), "utf8"))
      .toBe("last-known-good");
  });

  it("restores a failed repair backup when the canonical candidate vanished", async () => {
    const runId = await createTestRun("recover-repair-backup");
    const backup = `${candidatePaths(runId).root}.repair-backup-deadbeef`;
    await writeCandidateBundle(runId, backup, "failed");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "retain-failed",
      state: "failed",
    });
    expect(await fs.readFile(path.join(candidatePaths(runId).site, "index.html"), "utf8"))
      .toBe("candidate-failed");
  });

  it("restores the exact retired candidate and removes only closed transaction temp files", async () => {
    const runId = await createTestRun("recover-candidate-retired");
    const paths = candidatePaths(runId);
    const retired = `${paths.root}.retired-123-456`;
    await writeCandidateBundle(runId, retired, "ready-for-gates");
    const temporary = path.join(sitePaths(runId).root, ".candidate-provenance.123.456.tmp");
    const unrelated = path.join(sitePaths(runId).root, ".candidate-provenance.keep");
    await fs.writeFile(temporary, "partial");
    await fs.writeFile(unrelated, "operator-data");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "resume-gates",
      state: "ready-for-gates",
    });
    expect(await fs.readFile(path.join(paths.site, "index.html"), "utf8"))
      .toBe("candidate-ready-for-gates");
    await expect(fs.stat(temporary)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(unrelated, "utf8")).toBe("operator-data");
  });
});
