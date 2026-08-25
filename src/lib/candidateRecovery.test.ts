import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidateManifestSha256,
  createCandidateManifest,
  loadCandidateRecoveryRecord,
  recoverCandidateState,
  transitionCandidateProvenance,
} from "./candidate";
import {
  CandidateProvenanceV1Schema,
  DesignTokensSchema,
  type CandidateProvenanceV1,
} from "./contracts";
import {
  advanceEvidenceWorkflow,
  candidatePaths,
  createRun,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
} from "./runstate";
import { buildCssArchitecture, buildTailwindPlan, buildTokenInventory } from "./evidence";

const runIds: string[] = [];
const externalRoots: string[] = [];
const inputBytes = Buffer.from('{"fixture":"candidate-recovery"}\n');
const execFileAsync = promisify(execFile);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createTestRun(prefix: string, layoutAuthority: "template-v1" | "page-ir-v1" = "template-v1"): Promise<string> {
  const runId = `${prefix}-${process.pid}-${runIds.length}`;
  runIds.push(runId);
  await createRun({
    id: runId,
    pipelineVersion: "legacy-v1",
    layoutAuthority,
    pageIrRolloutPermitted: layoutAuthority === "page-ir-v1" ? true : undefined,
  });
  await fs.writeFile(path.join(sitePaths(runId).root, "intake.json"), inputBytes);
  return runId;
}

function preparing(runId: string, pageIrSha256?: string): CandidateProvenanceV1 {
  return CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: "candidate-v1",
    runId,
    createdAt: "2026-08-23T00:00:00.000Z",
    state: "preparing",
    history: [{ state: "preparing", at: "2026-08-23T00:00:00.000Z" }],
    inputArtifactHashes: [{ path: "intake.json", sha256: sha256(inputBytes) }],
    layoutAuthority: pageIrSha256 ? "page-ir-v1" : "template-v1",
    compilerVersion: "fixture-v1",
    pageIrSha256,
  });
}

async function writeCandidateBundle(
  runId: string,
  root: string,
  state: "ready-for-gates" | "failed" | "promotable" | "abandoned",
  pageIrSha256?: string,
): Promise<void> {
  const site = path.join(root, "site");
  await fs.mkdir(site, { recursive: true });
  await fs.writeFile(path.join(site, "index.html"), `candidate-${state}`);
  const manifest = await createCandidateManifest(site);
  await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  let provenance = transitionCandidateProvenance(
    preparing(runId, pageIrSha256),
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

async function writePageIrEditJournalFixture(input: {
  runId: string;
  token: string;
  beforeCandidateProvenance: Buffer;
  beforePageIr: Buffer;
  beforeHistory: Buffer;
  afterPageIr: Buffer;
  afterHistory: Buffer;
  afterFallback: Buffer;
}): Promise<void> {
  const root = path.join(sitePaths(input.runId).root, ".page-ir-edit-transaction");
  const snapshots = path.join(root, "snapshots");
  await fs.mkdir(snapshots, { recursive: true });
  const files = [
    {
      relativePath: "page-ir-edit-history.json",
      before: { present: true, sizeBytes: input.beforeHistory.byteLength, sha256: sha256(input.beforeHistory) },
      after: { sizeBytes: input.afterHistory.byteLength, sha256: sha256(input.afterHistory) },
    },
    {
      relativePath: "page-ir.json",
      before: { present: true, sizeBytes: input.beforePageIr.byteLength, sha256: sha256(input.beforePageIr) },
      after: { sizeBytes: input.afterPageIr.byteLength, sha256: sha256(input.afterPageIr) },
    },
    {
      relativePath: "uploads/page-ir-edit-assets/hero-aaaaaaaaaaaa.png",
      before: { present: false },
      after: { sizeBytes: input.afterFallback.byteLength, sha256: sha256(input.afterFallback) },
    },
  ];
  await fs.writeFile(path.join(snapshots, "0.bin"), input.beforeHistory);
  await fs.writeFile(path.join(snapshots, "1.bin"), input.beforePageIr);
  await fs.writeFile(path.join(root, "journal.json"), JSON.stringify({
    schemaVersion: 1,
    runId: input.runId,
    token: input.token,
    beforeCandidateProvenanceSha256: sha256(input.beforeCandidateProvenance),
    nextPageIrSha256: sha256(input.afterPageIr),
    files,
  }, null, 2));
}

async function seedCssArchitecture(runId: string): Promise<void> {
  const approve = async (artifact: Awaited<ReturnType<typeof saveEvidenceArtifactVersion>>) => {
    await transitionEvidenceArtifactApproval(runId, artifact.artifactType, artifact.version, "in-review");
    await transitionEvidenceArtifactApproval(runId, artifact.artifactType, artifact.version, "approved");
  };
  const ledger = await saveEvidenceArtifactVersion(runId, {
    artifactType: "ledger",
    artifact: {
      projectTarget: "website",
      businessIntelligence: { kind: "business-intelligence", sources: [], competitors: [], marketExpectations: [], differentiationOpportunities: [], claims: [] },
      referoDesignEvidence: { kind: "refero-design-evidence", sources: [], references: [], claims: [] },
      clientEvidence: { sources: [], claims: [], artifactRelationships: [], unsupportedUploadIds: [] },
    },
  });
  await approve(ledger);
  await advanceEvidenceWorkflow(runId, "contract");
  const designTokens = DesignTokensSchema.parse({
    colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions" }],
    fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400], role: "body" }],
    typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
    radii: { sm: "4px" }, spacing: { sm: "8px" }, borders: { subtle: "1px solid #ddd" },
    shadows: { raised: "0 2px 8px #0002" }, layers: { base: "0" },
    layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 },
    motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] },
    componentStates: [{ component: "button", states: { default: "solid" } }],
    imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
  });
  const contract = await saveEvidenceArtifactVersion(runId, {
    artifactType: "design-contract",
    artifact: { title: "Recovery fixture", contractPath: "DESIGN.md", sourceLedgerVersion: 1, approvedEvidenceIds: [], exportPaths: [], contractSha256: "b".repeat(64), exportSha256: "c".repeat(64), designTokens },
  });
  await approve(contract);
  await advanceEvidenceWorkflow(runId, "tokens");
  const tokenArtifact = buildTokenInventory(designTokens, 1, []);
  const tokens = await saveEvidenceArtifactVersion(runId, { artifactType: "token-inventory", artifact: tokenArtifact });
  await approve(tokens);
  await advanceEvidenceWorkflow(runId, "tailwind");
  const tailwindArtifact = buildTailwindPlan(tokenArtifact, 1);
  const tailwind = await saveEvidenceArtifactVersion(runId, { artifactType: "tailwind-plan", artifact: tailwindArtifact });
  await approve(tailwind);
  await advanceEvidenceWorkflow(runId, "css");
  const css = await saveEvidenceArtifactVersion(runId, { artifactType: "css-architecture", artifact: buildCssArchitecture(tokenArtifact, tailwindArtifact, 1) });
  await approve(css);
  await advanceEvidenceWorkflow(runId, "build");
}

afterEach(async () => {
  await Promise.all([
    ...runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
    ...externalRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  ]);
});

describe("candidate crash recovery", () => {
  it("rejects a symlinked candidate recovery record", async () => {
    const runId = await createTestRun("recovery-record-symlink");
    const root = sitePaths(runId).root;
    const target = path.join(root, "recovery-target.json");
    await fs.writeFile(target, "{}\n");
    await fs.symlink(target, path.join(root, "candidate-recovery.json"));

    await expect(loadCandidateRecoveryRecord(runId)).rejects.toThrow(/symlink|regular/i);
  });

  it("rejects a hardlinked candidate recovery record", async () => {
    const runId = await createTestRun("recovery-record-hardlink");
    const root = sitePaths(runId).root;
    const target = path.join(root, "recovery-target.json");
    await fs.writeFile(target, "{}\n");
    await fs.link(target, path.join(root, "candidate-recovery.json"));

    await expect(loadCandidateRecoveryRecord(runId)).rejects.toThrow(/hardlink|regular/i);
  });

  it("rejects an oversized candidate recovery record before reading it", async () => {
    const runId = await createTestRun("recovery-record-oversize");
    const record = path.join(sitePaths(runId).root, "candidate-recovery.json");
    const sparse = await fs.open(record, "w");
    await sparse.truncate(16 * 1024 + 1);
    await sparse.close();

    await expect(loadCandidateRecoveryRecord(runId)).rejects.toThrow(/size limit|exceeds/i);
  });

  it("rejects a FIFO candidate recovery record without waiting for a writer", async () => {
    const runId = await createTestRun("recovery-record-fifo");
    const record = path.join(sitePaths(runId).root, "candidate-recovery.json");
    await execFileAsync("mkfifo", [record]);
    const read = loadCandidateRecoveryRecord(runId);
    const outcome = await Promise.race([
      read.then(() => "resolved", () => "rejected"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ]);
    if (outcome === "timeout") {
      await fs.writeFile(record, "{}\n");
      await read.catch(() => undefined);
    }

    expect(outcome).toBe("rejected");
    await expect(read).rejects.toThrow(/regular file/i);
  });

  it("removes a pre-authority journal staging footprint without touching candidate or live", async () => {
    const runId = await createTestRun("pir-preparing");
    const preparingRoot = path.join(
      sitePaths(runId).root,
      ".page-ir-edit-transaction-preparing-abcdef123456",
    );
    await fs.mkdir(preparingRoot);
    await fs.writeFile(path.join(preparingRoot, "partial"), "not authoritative");

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({ action: "absent" });
    await expect(fs.stat(preparingRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks Page IR journal rollback when a fallback parent is replaced by a symlink", async () => {
    const runId = await createTestRun("pir-symlink-parent", "page-ir-v1");
    const roots = sitePaths(runId);
    const canonical = candidatePaths(runId);
    const beforePageIr = Buffer.from('{"revision":"before"}\n');
    const beforeHistory = Buffer.from('{"history":"before"}\n');
    const afterPageIr = Buffer.from('{"revision":"after"}\n');
    const afterHistory = Buffer.from('{"history":"after"}\n');
    const fallback = Buffer.from("external-authority-must-survive");
    await fs.writeFile(path.join(roots.root, "page-ir.json"), beforePageIr);
    await fs.writeFile(path.join(roots.root, "page-ir-edit-history.json"), beforeHistory);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates", sha256(beforePageIr));
    const beforeProvenance = await fs.readFile(canonical.provenance);
    await writePageIrEditJournalFixture({
      runId,
      token: "abcdef123456",
      beforeCandidateProvenance: beforeProvenance,
      beforePageIr,
      beforeHistory,
      afterPageIr,
      afterHistory,
      afterFallback: fallback,
    });

    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-pir-recovery-"));
    externalRoots.push(externalRoot);
    const externalFallback = path.join(
      externalRoot,
      "page-ir-edit-assets",
      "hero-aaaaaaaaaaaa.png",
    );
    await fs.mkdir(path.dirname(externalFallback), { recursive: true });
    await fs.writeFile(externalFallback, fallback);
    await fs.symlink(externalRoot, path.join(roots.root, "uploads"));

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringMatching(/authority|target|symlink/i),
    });
    expect(await fs.readFile(externalFallback)).toEqual(fallback);
    await expect(
      fs.stat(path.join(roots.root, ".page-ir-edit-transaction")),
    ).resolves.toBeDefined();
  });

  it("blocks Page IR journal recovery when a snapshot is replaced by a symlink", async () => {
    const runId = await createTestRun("pir-symlink-snapshot", "page-ir-v1");
    const roots = sitePaths(runId);
    const canonical = candidatePaths(runId);
    const beforePageIr = Buffer.from('{"revision":"before"}\n');
    const beforeHistory = Buffer.from('{"history":"before"}\n');
    await fs.writeFile(path.join(roots.root, "page-ir.json"), beforePageIr);
    await fs.writeFile(path.join(roots.root, "page-ir-edit-history.json"), beforeHistory);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates", sha256(beforePageIr));
    await writePageIrEditJournalFixture({
      runId,
      token: "abcdef123456",
      beforeCandidateProvenance: await fs.readFile(canonical.provenance),
      beforePageIr,
      beforeHistory,
      afterPageIr: Buffer.from('{"revision":"after"}\n'),
      afterHistory: Buffer.from('{"history":"after"}\n'),
      afterFallback: Buffer.from("fallback-after"),
    });
    const snapshot = path.join(
      roots.root,
      ".page-ir-edit-transaction",
      "snapshots",
      "1.bin",
    );
    await fs.rm(snapshot);
    await fs.symlink(path.join(roots.root, "page-ir.json"), snapshot);

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringMatching(/unsafe|symlink|journal/i),
    });
    expect(await fs.readFile(path.join(roots.root, "page-ir.json"))).toEqual(beforePageIr);
    await expect(
      fs.stat(path.join(roots.root, ".page-ir-edit-transaction")),
    ).resolves.toBeDefined();
  });

  it.each([
    ["after-candidate-retire", "retire"],
    ["after-page-ir-write", "page"],
    ["after-history-write", "history"],
    ["after-new-candidate-gates", "gates"],
    ["after-promotion-live-replaced", "promote"],
  ] as const)("rolls back the Page IR edit journal crash seam %s byte-exactly", async (phase, id) => {
    const runId = await createTestRun(`pir-${id}`, "page-ir-v1");
    const roots = sitePaths(runId);
    const canonical = candidatePaths(runId);
    const token = "abcdef123456";
    const retired = `${canonical.root}.retired-${token}`;
    const beforePageIr = Buffer.from('{"revision":"before"}\n');
    const beforeHistory = Buffer.from('{"history":"before"}\n');
    const afterPageIr = Buffer.from('{"revision":"after"}\n');
    const afterHistory = Buffer.from('{"history":"after"}\n');
    const fallback = Buffer.from("fallback-after");
    const fallbackPath = path.join(roots.root, "uploads/page-ir-edit-assets/hero-aaaaaaaaaaaa.png");
    await fs.writeFile(path.join(roots.root, "page-ir.json"), beforePageIr);
    await fs.writeFile(path.join(roots.root, "page-ir-edit-history.json"), beforeHistory);
    await seedCssArchitecture(runId);
    await writeCandidateBundle(runId, canonical.root, "promotable", sha256(beforePageIr));
    const beforeManifestBytes = await fs.readFile(canonical.manifest);
    const beforeReceiptBytes = await fs.readFile(canonical.gates);
    const beforePromotable = CandidateProvenanceV1Schema.parse(
      JSON.parse(await fs.readFile(canonical.provenance, "utf8")),
    );
    const beforePromoted = transitionCandidateProvenance(
      beforePromotable,
      "promoted",
      "2026-08-23T00:00:03.000Z",
      { promotedBuildSha256: beforePromotable.buildSha256 },
    );
    const beforeProvenance = Buffer.from(JSON.stringify(beforePromoted, null, 2));
    await fs.writeFile(canonical.provenance, beforeProvenance);
    await fs.cp(canonical.site, roots.site, { recursive: true });
    await fs.mkdir(path.join(roots.site, ".one-box"));
    await fs.writeFile(path.join(roots.site, ".one-box", "candidate-manifest.json"), beforeManifestBytes);
    await fs.writeFile(path.join(roots.site, ".one-box", "provenance.json"), beforeProvenance);
    await fs.writeFile(path.join(roots.site, ".one-box", "gates.json"), beforeReceiptBytes);
    await fs.rename(canonical.root, retired);
    if (phase === "after-promotion-live-replaced") {
      await fs.rename(roots.site, path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe"));
    }
    await writePageIrEditJournalFixture({
      runId,
      token,
      beforeCandidateProvenance: beforeProvenance,
      beforePageIr,
      beforeHistory,
      afterPageIr,
      afterHistory,
      afterFallback: fallback,
    });
    if (phase !== "after-candidate-retire") {
      await fs.writeFile(path.join(roots.root, "page-ir.json"), afterPageIr);
    }
    if (["after-history-write", "after-new-candidate-gates", "after-promotion-live-replaced"].includes(phase)) {
      await fs.writeFile(path.join(roots.root, "page-ir-edit-history.json"), afterHistory);
      await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
      await fs.writeFile(fallbackPath, fallback);
    }
    if (phase === "after-new-candidate-gates" || phase === "after-promotion-live-replaced") {
      await writeCandidateBundle(
        runId,
        canonical.root,
        phase === "after-promotion-live-replaced" ? "promotable" : "ready-for-gates",
        sha256(afterPageIr),
      );
    }
    if (phase === "after-promotion-live-replaced") {
      const manifestBytes = await fs.readFile(canonical.manifest);
      const receiptBytes = await fs.readFile(canonical.gates);
      const provenance = CandidateProvenanceV1Schema.parse(
        JSON.parse(await fs.readFile(canonical.provenance, "utf8")),
      );
      const promoted = transitionCandidateProvenance(
        provenance,
        "promoted",
        "2026-08-23T00:00:03.000Z",
        { promotedBuildSha256: provenance.buildSha256 },
      );
      await fs.cp(canonical.site, roots.site, { recursive: true });
      await fs.mkdir(path.join(roots.site, ".one-box"));
      await fs.writeFile(path.join(roots.site, ".one-box", "candidate-manifest.json"), manifestBytes);
      await fs.writeFile(path.join(roots.site, ".one-box", "provenance.json"), JSON.stringify(promoted, null, 2));
      await fs.writeFile(path.join(roots.site, ".one-box", "gates.json"), receiptBytes);
    }

    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "completed",
      state: "promoted",
    });
    expect(await fs.readFile(path.join(roots.root, "page-ir.json"))).toEqual(beforePageIr);
    expect(await fs.readFile(path.join(roots.root, "page-ir-edit-history.json"))).toEqual(beforeHistory);
    expect(await fs.readFile(canonical.provenance)).toEqual(beforeProvenance);
    await expect(fs.stat(fallbackPath)).rejects.toMatchObject({ code: "ENOENT" });
    if (phase === "after-promotion-live-replaced") {
      expect(await fs.readFile(path.join(roots.site, "index.html"), "utf8"))
        .toBe("candidate-promotable");
    }
    expect((await fs.readdir(roots.root)).filter((entry) =>
      entry === ".page-ir-edit-transaction" || /^candidate\.retired-/.test(entry)
    )).toEqual([]);
  });

  it("finalizes a committed promoted Page IR edit and removes journal and retired authority", async () => {
    const runId = await createTestRun("pir-finalize", "page-ir-v1");
    const roots = sitePaths(runId);
    const canonical = candidatePaths(runId);
    const token = "abcdef123456";
    const retired = `${canonical.root}.retired-${token}`;
    const beforePageIr = Buffer.from('{"revision":"before"}\n');
    const beforeHistory = Buffer.from('{"history":"before"}\n');
    const afterPageIr = Buffer.from('{"revision":"after"}\n');
    const afterHistory = Buffer.from('{"history":"after"}\n');
    const fallback = Buffer.from("fallback-after");
    const fallbackPath = path.join(roots.root, "uploads/page-ir-edit-assets/hero-aaaaaaaaaaaa.png");
    await fs.writeFile(path.join(roots.root, "page-ir.json"), afterPageIr);
    await fs.writeFile(path.join(roots.root, "page-ir-edit-history.json"), afterHistory);
    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, fallback);
    await seedCssArchitecture(runId);
    await writeCandidateBundle(runId, canonical.root, "promotable", sha256(beforePageIr));
    const beforeManifestBytes = await fs.readFile(canonical.manifest);
    const beforeReceiptBytes = await fs.readFile(canonical.gates);
    const beforePromotable = CandidateProvenanceV1Schema.parse(
      JSON.parse(await fs.readFile(canonical.provenance, "utf8")),
    );
    const beforePromoted = transitionCandidateProvenance(
      beforePromotable,
      "promoted",
      "2026-08-23T00:00:03.000Z",
      { promotedBuildSha256: beforePromotable.buildSha256 },
    );
    const beforeProvenance = Buffer.from(JSON.stringify(beforePromoted, null, 2));
    await fs.writeFile(canonical.provenance, beforeProvenance);
    await fs.cp(canonical.site, roots.site, { recursive: true });
    await fs.mkdir(path.join(roots.site, ".one-box"));
    await fs.writeFile(path.join(roots.site, ".one-box", "candidate-manifest.json"), beforeManifestBytes);
    await fs.writeFile(path.join(roots.site, ".one-box", "provenance.json"), beforeProvenance);
    await fs.writeFile(path.join(roots.site, ".one-box", "gates.json"), beforeReceiptBytes);
    await fs.rename(canonical.root, retired);
    await fs.rename(roots.site, path.join(roots.root, ".site-promotion-retired-123-deadbeefcafe"));
    await writeCandidateBundle(runId, canonical.root, "promotable", sha256(afterPageIr));
    const manifestBytes = await fs.readFile(canonical.manifest);
    const receiptBytes = await fs.readFile(canonical.gates);
    const promotable = CandidateProvenanceV1Schema.parse(
      JSON.parse(await fs.readFile(canonical.provenance, "utf8")),
    );
    const promoted = transitionCandidateProvenance(
      promotable,
      "promoted",
      "2026-08-23T00:00:03.000Z",
      { promotedBuildSha256: promotable.buildSha256 },
    );
    const promotedBytes = Buffer.from(JSON.stringify(promoted, null, 2));
    await fs.writeFile(canonical.provenance, promotedBytes);
    await fs.cp(canonical.site, roots.site, { recursive: true });
    await fs.mkdir(path.join(roots.site, ".one-box"));
    await fs.writeFile(path.join(roots.site, ".one-box", "candidate-manifest.json"), manifestBytes);
    await fs.writeFile(path.join(roots.site, ".one-box", "provenance.json"), promotedBytes);
    await fs.writeFile(path.join(roots.site, ".one-box", "gates.json"), receiptBytes);
    await writePageIrEditJournalFixture({
      runId,
      token,
      beforeCandidateProvenance: beforeProvenance,
      beforePageIr,
      beforeHistory,
      afterPageIr,
      afterHistory,
      afterFallback: fallback,
    });
    const finalizeResult = await recoverCandidateState(runId);
    expect(finalizeResult).toEqual({
      action: "completed",
      state: "promoted",
      performedActions: [
        "page-ir-edit-finalized",
        "promotion-reconciled",
      ],
    });
    expect(await fs.readFile(path.join(roots.root, "page-ir.json"))).toEqual(afterPageIr);
    expect(await fs.readFile(canonical.provenance)).toEqual(promotedBytes);
    await expect(fs.stat(retired)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(roots.root, ".page-ir-edit-transaction"))).rejects.toMatchObject({ code: "ENOENT" });
  });

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

  it("retains a restored-leftover action when post-rename authority validation blocks", async () => {
    const runId = await createTestRun("recover-restore-mismatch");
    const canonical = candidatePaths(runId);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates");
    const leftover = `${canonical.root}.building-interrupted`;
    await fs.rename(canonical.root, leftover);
    const realRename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, "rename").mockImplementation(async (
      source,
      destination,
    ) => {
      await realRename(source, destination);
      if (source === leftover && destination === canonical.root) {
        const provenance = JSON.parse(await fs.readFile(canonical.provenance, "utf8"));
        provenance.layoutAuthority = "page-ir-v1";
        provenance.pageIrSha256 = "a".repeat(64);
        await fs.writeFile(canonical.provenance, JSON.stringify(provenance, null, 2));
      }
    });

    try {
      await expect(recoverCandidateState(runId)).resolves.toMatchObject({
        action: "blocked",
        performedActions: ["candidate-reconciled", "recovery-blocked"],
      });
    } finally {
      renameSpy.mockRestore();
    }
    expect(JSON.parse(await fs.readFile(
      path.join(sitePaths(runId).root, "candidate-recovery.json"),
      "utf8",
    ))).toMatchObject({
      action: "blocked",
      performedActions: ["candidate-reconciled", "recovery-blocked"],
    });
  });

  it("retains a successful leftover restore when its directory sync fails", async () => {
    const runId = await createTestRun("recover-restore-sync");
    const canonical = candidatePaths(runId);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates");
    const leftover = `${canonical.root}.building-interrupted`;
    await fs.rename(canonical.root, leftover);
    const probe = await fs.open(sitePaths(runId).root, "r");
    const syncSpy = vi.spyOn(Object.getPrototypeOf(probe), "sync")
      .mockRejectedValueOnce(new Error("injected directory sync failure"));
    await probe.close();

    try {
      await expect(recoverCandidateState(runId)).resolves.toMatchObject({
        action: "blocked",
        performedActions: ["candidate-reconciled", "recovery-blocked"],
      });
    } finally {
      syncSpy.mockRestore();
    }
    expect(JSON.parse(await fs.readFile(canonical.provenance, "utf8")))
      .toMatchObject({ state: "ready-for-gates" });
    expect(JSON.parse(await fs.readFile(
      path.join(sitePaths(runId).root, "candidate-recovery.json"),
      "utf8",
    ))).toMatchObject({
      action: "blocked",
      performedActions: ["candidate-reconciled", "recovery-blocked"],
    });
  });

  it("retains the canonical candidate when leftover cleanup sync fails", async () => {
    const runId = await createTestRun("recover-cleanup-sync");
    const canonical = candidatePaths(runId);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates");
    const leftover = `${canonical.root}.building-orphan`;
    await fs.mkdir(leftover, { recursive: true });
    await fs.writeFile(path.join(leftover, "partial.txt"), "partial");
    const probe = await fs.open(sitePaths(runId).root, "r");
    const syncSpy = vi.spyOn(Object.getPrototypeOf(probe), "sync")
      .mockRejectedValueOnce(new Error("injected cleanup sync failure"));
    await probe.close();

    try {
      await expect(recoverCandidateState(runId)).resolves.toMatchObject({
        action: "blocked",
        performedActions: ["candidate-reconciled", "recovery-blocked"],
      });
    } finally {
      syncSpy.mockRestore();
    }
    expect(JSON.parse(await fs.readFile(canonical.provenance, "utf8")))
      .toMatchObject({ state: "ready-for-gates" });
    await expect(fs.stat(leftover)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await fs.readFile(
      path.join(sitePaths(runId).root, "candidate-recovery.json"),
      "utf8",
    ))).toMatchObject({
      action: "blocked",
      performedActions: ["candidate-reconciled", "recovery-blocked"],
    });
  });

  it("retains the canonical candidate when the first leftover deletion fails", async () => {
    const runId = await createTestRun("recover-cleanup-delete");
    const canonical = candidatePaths(runId);
    await writeCandidateBundle(runId, canonical.root, "ready-for-gates");
    const leftover = `${canonical.root}.building-orphan`;
    await fs.mkdir(leftover, { recursive: true });
    await fs.writeFile(path.join(leftover, "partial.txt"), "partial");
    const rmSpy = vi.spyOn(fs, "rm")
      .mockRejectedValueOnce(new Error("injected leftover deletion failure"));

    try {
      await expect(recoverCandidateState(runId)).resolves.toMatchObject({
        action: "blocked",
        performedActions: ["recovery-blocked"],
      });
    } finally {
      rmSpy.mockRestore();
    }
    expect(JSON.parse(await fs.readFile(canonical.provenance, "utf8")))
      .toMatchObject({ state: "ready-for-gates" });
    await expect(fs.stat(leftover)).resolves.toBeDefined();
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
