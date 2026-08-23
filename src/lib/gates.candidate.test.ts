import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  candidateManifestSha256,
  createCandidateManifest,
  transitionCandidateProvenance,
} from "./candidate";
import { gateBuiltCandidate } from "./builder";
import * as builderModule from "./builder";
import {
  CandidateProvenanceV1Schema,
  type CandidateProvenanceV1,
  type PipelineEvent,
} from "./contracts";
import { runCandidateGates } from "./gates";
import { runPipeline } from "./pipeline";
import {
  candidatePaths,
  claimBuildGateRepair,
  createRun,
  loadRun,
  sitePaths,
} from "./runstate";

const gateHarness = vi.hoisted(() => {
  const state = {
    navigationUrls: [] as string[],
    contrastCalls: [] as Array<{ url: string; siteDir: string }>,
    unresolvedCalls: [] as Array<{ siteDir: string; tokensCssText: string }>,
    contrastPass: true,
    gotoError: undefined as Error | undefined,
    onNavigate: undefined as ((url: string) => Promise<void>) | undefined,
  };
  const page = {
    goto: vi.fn(async (url: string) => {
      state.navigationUrls.push(url);
      if (state.gotoError) throw state.gotoError;
      await state.onNavigate?.(url);
    }),
    $$eval: vi.fn(async () => []),
    evaluate: vi.fn(async (fn: unknown) =>
      String(fn).includes("performance.getEntriesByType") ? 1 : [],
    ),
    on: vi.fn(),
    waitForTimeout: vi.fn(async () => undefined),
    locator: vi.fn(() => ({
      count: vi.fn(async () => 1),
      first: vi.fn(() => ({ isVisible: vi.fn(async () => true) })),
    })),
    context: vi.fn(() => ({
      newCDPSession: vi.fn(async () => ({ send: vi.fn(async () => undefined) })),
    })),
  };
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
  return {
    state,
    launch: vi.fn(async () => browser),
    contrast: vi.fn(async (_browser: unknown, url: string, siteDir: string) => {
      state.contrastCalls.push({ url, siteDir });
      return {
        gate: "contrast",
        pass: state.contrastPass,
        blocking: true,
        details: [],
        ranAt: "2026-08-22T00:00:00.000Z",
      };
    }),
    unresolved: vi.fn(async (siteDir: string, tokensCssText: string) => {
      state.unresolvedCalls.push({ siteDir, tokensCssText });
      return [];
    }),
    reset() {
      state.navigationUrls.length = 0;
      state.contrastCalls.length = 0;
      state.unresolvedCalls.length = 0;
      state.contrastPass = true;
      state.gotoError = undefined;
      state.onNavigate = undefined;
      vi.clearAllMocks();
    },
  };
});

vi.mock("playwright", () => ({ chromium: { launch: gateHarness.launch } }));
vi.mock("@axe-core/playwright", () => ({
  AxeBuilder: class {
    analyze = vi.fn(async () => ({ violations: [] }));
  },
}));
vi.mock("./contrastGate", () => ({ gateContrast: gateHarness.contrast }));
vi.mock("./cssVars", () => ({
  findUnresolvedSheetRefs: gateHarness.unresolved,
}));

const runIds: string[] = [];
const gateNames = [
  "token-drift",
  "color-role-compliance",
  "axe",
  "contrast",
  "console-errors",
  "assets",
  "no-js",
  "mobile-layout",
  "perf-budget",
];

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function testRunId(prefix = "candidate-gates"): string {
  const runId = `${prefix}-${process.pid}-${runIds.length}`;
  runIds.push(runId);
  return runId;
}

async function writeJson(filePath: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(JSON.stringify(value, null, 2));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return bytes;
}

function provenance(
  runId: string,
  inputArtifactHashes: CandidateProvenanceV1["inputArtifactHashes"],
): CandidateProvenanceV1 {
  return CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: "candidate-v1",
    runId,
    createdAt: "2026-08-22T00:00:00.000Z",
    state: "preparing",
    history: [{ state: "preparing", at: "2026-08-22T00:00:00.000Z" }],
    inputArtifactHashes,
    layoutAuthority: "template-v1",
    compilerVersion: "template-compiler@1",
  });
}

async function createReadyCandidate(runId: string) {
  const paths = candidatePaths(runId);
  await fs.mkdir(paths.site, { recursive: true });
  await fs.writeFile(
    path.join(paths.site, "index.html"),
    '<!doctype html><html lang="en"><head><title>Candidate</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="site.css"></head><body><nav>Navigation</nav><main><h1 data-edit-id="hero.headline">Candidate</h1><p>Candidate body copy.</p><section id="contact"><a data-edit-id="contact.cta" href="tel:5550100">Call now</a></section></main></body></html>',
  );
  await fs.writeFile(
    path.join(paths.site, "tokens.css"),
    ":root { --color-bg: #ffffff; --color-text: #111111; --font-body: Arial, sans-serif; }\n",
  );
  await fs.writeFile(
    path.join(paths.site, "site.css"),
    "* { box-sizing: border-box; color: var(--color-text); font-family: var(--font-body); } body { margin: 0; background: var(--color-bg); } nav, main, section { padding: 1rem; }\n",
  );

  const tokens = {
    colors: [
      { name: "Canvas", value: "#ffffff", cssVar: "--color-bg", role: "page" },
      { name: "Ink", value: "#111111", cssVar: "--color-text", role: "text" },
    ],
    fonts: [
      { family: "Arial", cssVar: "--font-body", weights: [400], role: "body" },
    ],
    typeScale: [],
    radii: {},
    spacing: {},
    layout: { maxWidthPx: 1200, sectionGapPx: 64, cardPaddingPx: 24 },
    motion: {
      easing: "linear",
      durationMs: { micro: 100, reveal: 200 },
      revealClasses: [],
    },
    componentStates: [],
    imageryBrief: {
      subject: "none",
      lighting: "none",
      grade: "none",
      framing: "none",
      avoid: [],
    },
  };
  const intake = {
    businessName: "Candidate Co",
    category: "service",
    location: "Portland, OR",
    services: ["Service"],
    phone: "555-0100",
    primaryAction: "call",
  };
  const tokenBytes = await writeJson(path.join(sitePaths(runId).root, "tokens.json"), tokens);
  const intakeBytes = await writeJson(path.join(sitePaths(runId).root, "intake.json"), intake);
  const manifest = await createCandidateManifest(paths.site);
  await writeJson(paths.manifest, manifest);
  const ready = transitionCandidateProvenance(
    provenance(runId, [
      { path: "intake.json", sha256: sha256(intakeBytes) },
      { path: "tokens.json", sha256: sha256(tokenBytes) },
    ]),
    "ready-for-gates",
    "2026-08-22T00:00:01.000Z",
    {
      candidateManifestSha256: candidateManifestSha256(manifest),
      buildSha256: manifest.buildSha256,
    },
  );
  await writeJson(paths.provenance, ready);
  return { paths, manifest, ready };
}

async function writeLiveSentinels(runId: string) {
  const liveIndex = Buffer.from("live-site-sentinel");
  const liveGates = Buffer.from("live-gates-sentinel");
  await fs.mkdir(path.join(sitePaths(runId).site, "assets"), { recursive: true });
  await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), liveIndex);
  await fs.writeFile(
    path.join(sitePaths(runId).site, "manifest.json"),
    Buffer.from("live-manifest-sentinel"),
  );
  await fs.writeFile(
    path.join(sitePaths(runId).site, "assets", "live.css"),
    Buffer.from("live-asset-sentinel"),
  );
  await fs.writeFile(path.join(sitePaths(runId).root, "gates.json"), liveGates);
  return {
    liveGates,
    liveInventory: [
      ["assets/live.css", "live-asset-sentinel"],
      ["index.html", "live-site-sentinel"],
      ["manifest.json", "live-manifest-sentinel"],
    ].map(([relativePath, bytes]) => ({
      path: relativePath,
      bytes,
      sha256: sha256(bytes),
    })),
  };
}

async function expectLiveSentinels(
  runId: string,
  sentinels: Awaited<ReturnType<typeof writeLiveSentinels>>,
) {
  const liveFiles = (
    await fs.readdir(sitePaths(runId).site, { recursive: true })
  )
    .filter((relativePath) => !relativePath.endsWith("assets"))
    .sort();
  expect(liveFiles).toEqual(sentinels.liveInventory.map((file) => file.path));
  for (const expected of sentinels.liveInventory) {
    const bytes = await fs.readFile(path.join(sitePaths(runId).site, expected.path));
    expect(bytes.toString("utf8")).toBe(expected.bytes);
    expect(sha256(bytes)).toBe(expected.sha256);
  }
  expect(await fs.readFile(path.join(sitePaths(runId).root, "gates.json"))).toEqual(
    sentinels.liveGates,
  );
  expect(sha256(await fs.readFile(path.join(sitePaths(runId).root, "gates.json"))))
    .toBe(sha256(sentinels.liveGates));
}

type RepairRequest = {
  failures: Array<{ gate: string; details: string[] }>;
  files: Array<{ path: "index.html" | "tokens.css"; content: string }>;
};

type RepairProvider = (request: RepairRequest) => Promise<unknown>;

function candidateRepairApi() {
  const api = builderModule as typeof builderModule & {
    repairFailedCandidate?: (
      runId: string,
      provider: RepairProvider,
    ) => Promise<{ state: "failed" | "promotable" } | undefined>;
    gateAndRepairBuiltCandidate?: (
      runId: string,
      provider: RepairProvider,
    ) => Promise<{
      disposition: { state: "failed" | "promotable"; receipt: { reports: Array<{ gate: string }> } };
      repairCompleted: boolean;
    }>;
  };
  expect(api.repairFailedCandidate).toBeTypeOf("function");
  expect(api.gateAndRepairBuiltCandidate).toBeTypeOf("function");
  return {
    repairFailedCandidate: api.repairFailedCandidate!,
    gateAndRepairBuiltCandidate: api.gateAndRepairBuiltCandidate!,
  };
}

async function createFailedRepairCandidate() {
  const runId = testRunId("repair");
  await createRun({ id: runId, pipelineVersion: "legacy-v1" });
  const candidate = await createReadyCandidate(runId);
  gateHarness.state.contrastPass = false;
  const disposition = await gateBuiltCandidate(runId);
  expect(disposition.state).toBe("failed");
  return { runId, candidate, disposition };
}

async function snapshotTree(root: string): Promise<Map<string, Buffer>> {
  const snapshot = new Map<string, Buffer>();
  async function visit(directory: string): Promise<void> {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) await visit(absolute);
      else snapshot.set(relative, await fs.readFile(absolute));
    }
  }
  await visit(root);
  return snapshot;
}

function expectTreeSnapshot(
  actual: Map<string, Buffer>,
  expected: Map<string, Buffer>,
): void {
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [relative, bytes] of expected) {
    expect(actual.get(relative)).toEqual(bytes);
  }
}

async function rebindFailedCandidate(runId: string): Promise<void> {
  const paths = candidatePaths(runId);
  const manifest = await createCandidateManifest(paths.site);
  await writeJson(paths.manifest, manifest);
  const receipt = JSON.parse(await fs.readFile(paths.gates, "utf8"));
  const reboundReceipt = {
    ...receipt,
    candidateManifestSha256: candidateManifestSha256(manifest),
    buildSha256: manifest.buildSha256,
  };
  const receiptBytes = await writeJson(paths.gates, reboundReceipt);
  const provenance = JSON.parse(await fs.readFile(paths.provenance, "utf8"));
  await writeJson(paths.provenance, {
    ...provenance,
    candidateManifestSha256: candidateManifestSha256(manifest),
    buildSha256: manifest.buildSha256,
    gateReportSha256: sha256(receiptBytes),
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  gateHarness.reset();
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("candidate gates", () => {
  it("runs the complete suite against one candidate root and writes only its bound receipt", async () => {
    expectTypeOf(runCandidateGates).parameters.toEqualTypeOf<[string]>();
    const runId = testRunId();
    const { paths, manifest, ready } = await createReadyCandidate(runId);
    const provenanceBefore = await fs.readFile(paths.provenance);
    const sentinels = await writeLiveSentinels(runId);

    const result = await runCandidateGates(runId);
    const receiptBytes = await fs.readFile(paths.gates);

    expect(result.receipt.reports.map((report) => report.gate)).toEqual(gateNames);
    expect(result.receipt.reports.map((report) => report.blocking)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(result.receipt).toMatchObject({
      schemaVersion: 1,
      runId,
      candidateManifestSha256: candidateManifestSha256(manifest),
      buildSha256: manifest.buildSha256,
    });
    expect(JSON.parse(receiptBytes.toString("utf8"))).toEqual(result.receipt);
    expect(result.gateReportSha256).toBe(sha256(receiptBytes));
    expect(gateHarness.state.navigationUrls.length).toBeGreaterThan(0);
    expect(gateHarness.state.navigationUrls.every(
      (url) => url === pathToFileURL(path.join(paths.site, "index.html")).href,
    )).toBe(true);
    expect(gateHarness.state.contrastCalls).toEqual([
      {
        url: pathToFileURL(path.join(paths.site, "index.html")).href,
        siteDir: paths.site,
      },
    ]);
    expect(gateHarness.state.unresolvedCalls).toEqual([
      {
        siteDir: paths.site,
        tokensCssText:
          ":root { --color-bg: #ffffff; --color-text: #111111; --font-body: Arial, sans-serif; }\n",
      },
    ]);
    expect(await fs.readFile(paths.provenance)).toEqual(provenanceBefore);
    expect(ready.state).toBe("ready-for-gates");
    await expectLiveSentinels(runId, sentinels);
  });

  it("records a complete candidate receipt when a blocking gate fails", async () => {
    const runId = testRunId("candidate-blocked");
    const { paths } = await createReadyCandidate(runId);
    const sentinels = await writeLiveSentinels(runId);
    gateHarness.state.contrastPass = false;

    const result = await runCandidateGates(runId);

    expect(result.receipt.reports.map((report) => report.gate)).toEqual(gateNames);
    expect(result.receipt.reports.find((report) => report.gate === "contrast")).toMatchObject({
      pass: false,
      blocking: true,
    });
    expect(JSON.parse(await fs.readFile(paths.gates, "utf8"))).toEqual(result.receipt);
    await expectLiveSentinels(runId, sentinels);
  });

  it("dispositions a blocking candidate receipt as failed without changing live bytes", async () => {
    const runId = testRunId("candidate-disposition-failed");
    const { paths } = await createReadyCandidate(runId);
    const sentinels = await writeLiveSentinels(runId);
    gateHarness.state.contrastPass = false;

    const result = await gateBuiltCandidate(runId);

    expect(result.state).toBe("failed");
    const provenance = JSON.parse(await fs.readFile(paths.provenance, "utf8"));
    const receiptBytes = await fs.readFile(paths.gates);
    expect(provenance).toMatchObject({
      state: "failed",
      gateReportSha256: sha256(receiptBytes),
    });
    await expectLiveSentinels(runId, sentinels);
  });

  it("leaves no served site or canonical live receipt after an initial blocking failure", async () => {
    const runId = testRunId("candidate-initial-failed");
    const { paths } = await createReadyCandidate(runId);
    gateHarness.state.contrastPass = false;

    const result = await gateBuiltCandidate(runId);

    expect(result.state).toBe("failed");
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "failed",
      gateReportSha256: result.gateReportSha256,
    });
    await expect(fs.stat(sitePaths(runId).site)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(sitePaths(runId).root, "gates.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("dispositions a fully passing candidate as promotable without publishing it", async () => {
    const runId = testRunId("candidate-disposition-promotable");
    const { paths } = await createReadyCandidate(runId);

    const result = await gateBuiltCandidate(runId);

    expect(result.state).toBe("promotable");
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "promotable",
      gateReportSha256: result.gateReportSha256,
    });
    await expect(fs.stat(sitePaths(runId).site)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("marks the candidate failed without a fake receipt when gate execution throws", async () => {
    const runId = testRunId("candidate-disposition-error");
    const { paths } = await createReadyCandidate(runId);
    const sentinels = await writeLiveSentinels(runId);
    gateHarness.state.gotoError = new Error("browser failed");

    await expect(gateBuiltCandidate(runId)).rejects.toThrow("browser failed");

    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8"))).toMatchObject({
      state: "failed",
    });
    expect(JSON.parse(await fs.readFile(paths.provenance, "utf8")))
      .not.toHaveProperty("gateReportSha256");
    await expect(fs.stat(paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    await expectLiveSentinels(runId, sentinels);
  });

  it("rolls back a new receipt when provenance disposition cannot publish", async () => {
    const runId = testRunId("candidate-disposition-rollback");
    const { paths } = await createReadyCandidate(runId);
    const provenanceBefore = await fs.readFile(paths.provenance);
    const sentinels = await writeLiveSentinels(runId);
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (
        String(to) === paths.provenance &&
        String(from).includes(".candidate-provenance.")
      ) {
        throw new Error("provenance disposition rename failed");
      }
      return realRename(from, to);
    });

    await expect(gateBuiltCandidate(runId)).rejects.toThrow(
      "provenance disposition rename failed",
    );

    expect(await fs.readFile(paths.provenance)).toEqual(provenanceBefore);
    await expect(fs.stat(paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(paths.root)).some((entry) => entry.includes(".tmp")))
      .toBe(false);
    await expectLiveSentinels(runId, sentinels);
  });

  it("restores exact prior receipt and provenance bytes when disposition cannot publish", async () => {
    const runId = testRunId("candidate-prior-rollback");
    const { paths, ready } = await createReadyCandidate(runId);
    const priorReceipt = Buffer.from("prior candidate receipt bytes\n");
    await fs.writeFile(paths.gates, priorReceipt);
    await writeJson(paths.provenance, {
      ...ready,
      gateReportSha256: sha256(priorReceipt),
    });
    const provenanceBefore = await fs.readFile(paths.provenance);
    const sentinels = await writeLiveSentinels(runId);
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (
        String(to) === paths.provenance &&
        String(from).includes(".candidate-provenance.")
      ) {
        throw new Error("provenance disposition rename failed");
      }
      return realRename(from, to);
    });

    await expect(gateBuiltCandidate(runId)).rejects.toThrow(
      "provenance disposition rename failed",
    );

    expect(await fs.readFile(paths.provenance)).toEqual(provenanceBefore);
    expect(await fs.readFile(paths.gates)).toEqual(priorReceipt);
    expect((await fs.readdir(paths.root)).some((entry) => entry.includes(".tmp")))
      .toBe(false);
    await expectLiveSentinels(runId, sentinels);
  });

  it.each([
    ["../escape", "bad runId"],
    ["abc", "bad runId"],
  ])("rejects unsafe run id %j before browser or writes", async (runId, message) => {
    const escapedRoot = path.resolve(process.cwd(), "sites", runId);
    await expect(fs.stat(escapedRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(runCandidateGates(runId)).rejects.toThrow(message);
    expect(gateHarness.launch).not.toHaveBeenCalled();
    await expect(fs.stat(escapedRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires provenance bindings for every consumed run-root input", async () => {
    const tokenRunId = testRunId("candidate-unbound-token");
    const tokenCandidate = await createReadyCandidate(tokenRunId);
    await writeJson(tokenCandidate.paths.provenance, {
      ...tokenCandidate.ready,
      inputArtifactHashes: tokenCandidate.ready.inputArtifactHashes.filter(
        (input) => input.path !== "tokens.json",
      ),
    });
    await expect(runCandidateGates(tokenRunId)).rejects.toThrow(
      /not bound by provenance.*tokens\.json/,
    );
    await expect(fs.stat(tokenCandidate.paths.gates)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const intakeRunId = testRunId("candidate-unbound-intake");
    const intakeCandidate = await createReadyCandidate(intakeRunId);
    await writeJson(intakeCandidate.paths.provenance, {
      ...intakeCandidate.ready,
      inputArtifactHashes: intakeCandidate.ready.inputArtifactHashes.filter(
        (input) => input.path !== "intake.json",
      ),
    });
    await expect(runCandidateGates(intakeRunId)).rejects.toThrow(
      /not bound by provenance.*intake\.json/,
    );
    await expect(fs.stat(intakeCandidate.paths.gates)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const missingRunId = testRunId("candidate-bound-intake-missing");
    const missingCandidate = await createReadyCandidate(missingRunId);
    await fs.rm(path.join(sitePaths(missingRunId).root, "intake.json"));
    await expect(runCandidateGates(missingRunId)).rejects.toThrow(
      /bound gate input is missing.*intake\.json/,
    );
    await expect(fs.stat(missingCandidate.paths.gates)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(gateHarness.launch).not.toHaveBeenCalled();
  });

  it("rejects cross-run, malformed, and symlinked candidates before browser or report writes", async () => {
    const crossRunId = testRunId("candidate-cross");
    const cross = await createReadyCandidate(crossRunId);
    await writeJson(cross.paths.provenance, { ...cross.ready, runId: "other-run" });
    await expect(runCandidateGates(crossRunId)).rejects.toThrow(/runId.*root/);
    await expect(fs.stat(cross.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });

    const malformedRunId = testRunId("candidate-malformed");
    const malformed = await createReadyCandidate(malformedRunId);
    await fs.writeFile(malformed.paths.provenance, "not-json");
    await expect(runCandidateGates(malformedRunId)).rejects.toThrow();
    await expect(fs.stat(malformed.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });

    const symlinkRunId = testRunId("candidate-symlink");
    const symlinked = await createReadyCandidate(symlinkRunId);
    const outside = await fs.mkdtemp(path.join(process.cwd(), ".tmp-obx-011-"));
    try {
      await fs.rm(symlinked.paths.site, { recursive: true });
      await fs.symlink(outside, symlinked.paths.site);
      await expect(runCandidateGates(symlinkRunId)).rejects.toThrow(/symlink/);
      await expect(fs.stat(symlinked.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
    expect(gateHarness.launch).not.toHaveBeenCalled();
  });

  it("rejects manifest/build tamper before and during gates without emitting a report", async () => {
    const preRunId = testRunId("candidate-pre-tamper");
    const pre = await createReadyCandidate(preRunId);
    const preSentinels = await writeLiveSentinels(preRunId);
    await fs.writeFile(path.join(pre.paths.site, "index.html"), "tampered-before");
    await expect(runCandidateGates(preRunId)).rejects.toThrow(/mismatch/);
    await expect(fs.stat(pre.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    await expectLiveSentinels(preRunId, preSentinels);
    expect(gateHarness.launch).not.toHaveBeenCalled();

    const duringRunId = testRunId("candidate-during-tamper");
    const during = await createReadyCandidate(duringRunId);
    const duringSentinels = await writeLiveSentinels(duringRunId);
    let tampered = false;
    gateHarness.state.onNavigate = async () => {
      if (tampered) return;
      tampered = true;
      await fs.writeFile(path.join(during.paths.site, "index.html"), "tampered-during");
    };
    await expect(runCandidateGates(duringRunId)).rejects.toThrow(/mismatch/);
    await expect(fs.stat(during.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    await expectLiveSentinels(duringRunId, duringSentinels);
  });

  it("rejects provenance manifest/build binding flips before and during gates", async () => {
    for (const [label, binding, expectedError] of [
      ["manifest", { candidateManifestSha256: "e".repeat(64) }, /manifest SHA-256/],
      ["build", { buildSha256: "f".repeat(64) }, /build SHA-256/],
    ] as const) {
      const preRunId = testRunId(`candidate-${label}-binding-pre`);
      const pre = await createReadyCandidate(preRunId);
      await writeJson(pre.paths.provenance, { ...pre.ready, ...binding });
      await expect(runCandidateGates(preRunId)).rejects.toThrow(expectedError);
      await expect(fs.stat(pre.paths.gates)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
    expect(gateHarness.launch).not.toHaveBeenCalled();

    const duringRunId = testRunId("candidate-binding-during");
    const during = await createReadyCandidate(duringRunId);
    let flipped = false;
    gateHarness.state.onNavigate = async () => {
      if (flipped) return;
      flipped = true;
      await writeJson(during.paths.provenance, {
        ...during.ready,
        candidateManifestSha256: "e".repeat(64),
        buildSha256: "f".repeat(64),
      });
    };
    await expect(runCandidateGates(duringRunId)).rejects.toThrow(
      /manifest SHA-256|binding changed/,
    );
    await expect(fs.stat(during.paths.gates)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails closed when a provenance-bound gate input changes before or during evaluation", async () => {
    const beforeRunId = testRunId("candidate-input-before");
    const before = await createReadyCandidate(beforeRunId);
    await fs.writeFile(path.join(sitePaths(beforeRunId).root, "tokens.json"), "{}");
    await expect(runCandidateGates(beforeRunId)).rejects.toThrow(/provenance/);
    expect(gateHarness.launch).not.toHaveBeenCalled();
    await expect(fs.stat(before.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });

    const duringRunId = testRunId("candidate-input-during");
    const during = await createReadyCandidate(duringRunId);
    let changed = false;
    gateHarness.state.onNavigate = async () => {
      if (changed) return;
      changed = true;
      await fs.writeFile(
        path.join(sitePaths(duringRunId).root, "intake.json"),
        JSON.stringify({ changed: true }),
      );
    };
    await expect(runCandidateGates(duringRunId)).rejects.toThrow(
      /gate input.*(?:provenance|changed)|provenance.*gate input/,
    );
    await expect(fs.stat(during.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a candidate tokens.css symlink swap before launching gates", async () => {
    const runId = testRunId("candidate-token-css-swap");
    const { paths } = await createReadyCandidate(runId);
    const tokenCssPath = path.join(paths.site, "tokens.css");
    const outsideRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-obx-011-"));
    const outsideTokens = path.join(outsideRoot, "tokens.css");
    await fs.writeFile(outsideTokens, await fs.readFile(tokenCssPath));

    const realOpen = fs.open.bind(fs);
    let tokenCssOpens = 0;
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const handle = await realOpen(...args);
      if (String(args[0]) === tokenCssPath && ++tokenCssOpens === 2) {
        const realClose = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementationOnce(async () => {
          await realClose();
          await fs.rename(tokenCssPath, `${tokenCssPath}.original`);
          await fs.symlink(outsideTokens, tokenCssPath);
        });
      }
      return handle;
    });

    try {
      await expect(runCandidateGates(runId)).rejects.toThrow(/symlink/);
      expect(gateHarness.launch).not.toHaveBeenCalled();
      await expect(fs.stat(paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("revalidates candidate bindings after staging receipt bytes and before rename", async () => {
    const runId = testRunId("candidate-pre-rename-tamper");
    const candidate = await createReadyCandidate(runId);
    const realWriteFile = fs.writeFile.bind(fs);
    let tampered = false;
    vi.spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      const result = await realWriteFile(file, data, options);
      if (!tampered && String(file).includes(".tmp-")) {
        tampered = true;
        await realWriteFile(
          candidate.paths.provenance,
          Buffer.from(
            JSON.stringify(
              {
                ...candidate.ready,
                candidateManifestSha256: "e".repeat(64),
                buildSha256: "f".repeat(64),
              },
              null,
              2,
            ),
          ),
        );
      }
      return result;
    });

    await expect(runCandidateGates(runId)).rejects.toThrow(
      /manifest SHA-256|binding changed/,
    );
    await expect(fs.stat(candidate.paths.gates)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      (await fs.readdir(sitePaths(runId).root)).some((entry) =>
        entry.includes(".tmp-"),
      ),
    ).toBe(false);
  });

  it("preserves a prior candidate report on browser and atomic write failure", async () => {
    const browserRunId = testRunId("candidate-browser-error");
    const browser = await createReadyCandidate(browserRunId);
    const browserSentinels = await writeLiveSentinels(browserRunId);
    gateHarness.state.gotoError = new Error("browser failed");
    await expect(runCandidateGates(browserRunId)).rejects.toThrow(/browser failed/);
    await expect(fs.stat(browser.paths.gates)).rejects.toMatchObject({ code: "ENOENT" });
    await expectLiveSentinels(browserRunId, browserSentinels);

    gateHarness.reset();
    const writeRunId = testRunId("candidate-atomic-error");
    const prior = await createReadyCandidate(writeRunId);
    const priorReceipt = Buffer.from("prior-candidate-report");
    await fs.writeFile(prior.paths.gates, priorReceipt);
    await writeJson(prior.paths.provenance, {
      ...prior.ready,
      gateReportSha256: sha256(priorReceipt),
    });
    const provenanceBefore = await fs.readFile(prior.paths.provenance);
    const sentinels = await writeLiveSentinels(writeRunId);
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to) === prior.paths.gates) throw new Error("atomic rename failed");
      return realRename(from, to);
    });

    await expect(runCandidateGates(writeRunId)).rejects.toThrow(/atomic rename failed/);
    expect(await fs.readFile(prior.paths.gates)).toEqual(priorReceipt);
    expect(await fs.readFile(prior.paths.provenance)).toEqual(provenanceBefore);
    expect((await fs.readdir(prior.paths.root)).sort()).toEqual([
      "gates.json",
      "manifest.json",
      "provenance.json",
      "site",
    ]);
    await expectLiveSentinels(writeRunId, sentinels);
  });
});

describe("failed candidate repair", () => {
  it("validates durable run authorization before a consumed-allowance return", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId } = await createFailedRepairCandidate();
    expect(await claimBuildGateRepair(runId)).toBe(true);
    const runFile = path.join(sitePaths(runId).root, "run.json");
    const persisted = JSON.parse(await fs.readFile(runFile, "utf8"));
    persisted.id = `other-${process.pid}`;
    await fs.writeFile(runFile, JSON.stringify(persisted, null, 2));
    const provider = vi.fn();

    await expect(repairFailedCandidate(runId, provider)).rejects.toThrow(
      /authorization does not match requested run/,
    );
    expect(provider).not.toHaveBeenCalled();
  });

  it("repairs only the candidate bundle and reruns the complete gate suite", async () => {
    const { gateAndRepairBuiltCandidate } = candidateRepairApi();
    const runId = testRunId("repair-full-suite");
    await createRun({ id: runId, pipelineVersion: "legacy-v1" });
    const candidate = await createReadyCandidate(runId);
    const live = await writeLiveSentinels(runId);
    const approvedEvidence = path.join(
      sitePaths(runId).root,
      "evidence",
      "approved",
      "visual-qa.json",
    );
    await fs.mkdir(path.dirname(approvedEvidence), { recursive: true });
    await fs.writeFile(approvedEvidence, "approved-evidence-sentinel");
    const evidenceBefore = await fs.readFile(approvedEvidence);
    const candidateBefore = await snapshotTree(candidate.paths.root);
    const mutationTargets: string[] = [];
    const realWriteFile = fs.writeFile.bind(fs);
    vi.spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      mutationTargets.push(String(file));
      return realWriteFile(file, data, options);
    });
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      mutationTargets.push(String(from), String(to));
      return realRename(from, to);
    });
    const realRm = fs.rm.bind(fs);
    vi.spyOn(fs, "rm").mockImplementation(async (target, options) => {
      mutationTargets.push(String(target));
      return realRm(target, options);
    });
    const realCopyFile = fs.copyFile.bind(fs);
    vi.spyOn(fs, "copyFile").mockImplementation(async (from, to, mode) => {
      mutationTargets.push(String(to));
      return realCopyFile(from, to, mode);
    });
    gateHarness.state.contrastPass = false;
    let failedReceiptBytes: Buffer | undefined;

    const result = await gateAndRepairBuiltCandidate(runId, async (request) => {
      expect(request.failures.map((failure) => failure.gate)).toEqual(["contrast"]);
      failedReceiptBytes = await fs.readFile(candidate.paths.gates);
      gateHarness.state.contrastPass = true;
      return {
        files: request.files
          .filter((file) => file.path === "tokens.css")
          .map((file) => ({ ...file, content: `${file.content}\n/* repaired */\n` })),
      };
    });

    expect(result.repairCompleted).toBe(true);
    expect(result.disposition.state).toBe("promotable");
    expect(result.disposition.receipt.reports.map((report) => report.gate)).toEqual(
      gateNames,
    );
    expect(gateHarness.state.contrastCalls).toHaveLength(2);
    expect(
      gateHarness.state.contrastCalls.every(
        (call) => call.siteDir === candidate.paths.site,
      ),
    ).toBe(true);
    expect(await fs.readFile(path.join(candidate.paths.site, "tokens.css"), "utf8"))
      .toContain("/* repaired */");
    const finalProvenance = JSON.parse(
      await fs.readFile(candidate.paths.provenance, "utf8"),
    );
    const finalReceiptBytes = await fs.readFile(candidate.paths.gates);
    const finalReceipt = JSON.parse(finalReceiptBytes.toString("utf8"));
    expect(finalProvenance).toMatchObject({ state: "promotable" });
    expect(finalProvenance.history.slice(-4).map((event: { state: string }) => event.state))
      .toEqual(["failed", "preparing", "ready-for-gates", "promotable"]);
    expect(finalProvenance.candidateManifestSha256)
      .not.toBe(candidate.ready.candidateManifestSha256);
    expect(finalProvenance.buildSha256).not.toBe(candidate.ready.buildSha256);
    expect(finalProvenance.gateReportSha256).toBe(sha256(finalReceiptBytes));
    expect(finalReceipt.candidateManifestSha256)
      .toBe(finalProvenance.candidateManifestSha256);
    expect(finalReceipt.buildSha256).toBe(finalProvenance.buildSha256);
    expect(finalReceiptBytes).not.toEqual(failedReceiptBytes);
    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(1);
    const candidateAfter = await snapshotTree(candidate.paths.root);
    expect(
      [...new Set([...candidateBefore.keys(), ...candidateAfter.keys()])]
        .filter(
          (relative) =>
            !candidateBefore.get(relative)?.equals(candidateAfter.get(relative) ?? Buffer.alloc(0)),
        )
        .sort(),
    ).toEqual(["gates.json", "manifest.json", "provenance.json", "site/tokens.css"]);
    const forbiddenMutationRoots = [
      sitePaths(runId).site,
      path.dirname(approvedEvidence),
      path.join(sitePaths(runId).root, "gates.json"),
    ];
    expect(
      mutationTargets.filter((target) =>
        forbiddenMutationRoots.some(
          (forbidden) => target === forbidden || target.startsWith(`${forbidden}${path.sep}`),
        ),
      ),
    ).toEqual([]);
    expect(await fs.readFile(approvedEvidence)).toEqual(evidenceBefore);
    await expectLiveSentinels(runId, live);
  });

  it("rejects an unbound failed receipt before claiming or calling the provider", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const receipt = JSON.parse(await fs.readFile(candidate.paths.gates, "utf8"));
    receipt.candidateManifestSha256 = "e".repeat(64);
    const receiptBytes = await writeJson(candidate.paths.gates, receipt);
    const provenance = JSON.parse(
      await fs.readFile(candidate.paths.provenance, "utf8"),
    );
    await writeJson(candidate.paths.provenance, {
      ...provenance,
      gateReportSha256: sha256(receiptBytes),
    });

    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("provider must not run");
      }),
    ).rejects.toThrow(/receipt.*compiled candidate|manifest/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
  });

  it("rejects linked candidate artifacts before claiming the allowance", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const tokensPath = path.join(candidate.paths.site, "tokens.css");
    await fs.rm(tokensPath);
    await fs.symlink(path.join(sitePaths(runId).site, "index.html"), tokensPath);

    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("provider must not run");
      }),
    ).rejects.toThrow(/symlink/);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
  });

  it("rejects hard-linked candidate artifacts before claiming the allowance", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const tokensPath = path.join(candidate.paths.site, "tokens.css");
    const aliasPath = path.join(sitePaths(runId).root, "tokens-hardlink.css");
    await fs.link(tokensPath, aliasPath);

    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("provider must not run");
      }),
    ).rejects.toThrow(/hardlink/);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
  });

  it.each([
    ["traversal", [{ path: "../../site/index.html", content: "owned" }]],
    [
      "duplicate",
      [
        { path: "index.html", content: "first" },
        { path: "index.html", content: "second" },
      ],
    ],
    ["non-allow-listed", [{ path: "site.css", content: "owned" }]],
  ])("rejects %s repair output and releases the allowance", async (_label, files) => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const before = await snapshotTree(candidate.paths.root);

    await expect(
      repairFailedCandidate(runId, async () => ({ files })),
    ).rejects.toThrow();

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
  });

  it.each([
    [
      "removed data-edit-id",
      "index.html",
      (content: string) => content.replace(' data-edit-id="hero.headline"', ""),
    ],
    [
      "changed data-edit-id",
      "index.html",
      (content: string) => content.replace("hero.headline", "attacker.control"),
    ],
    [
      "new script",
      "index.html",
      (content: string) => content.replace("</body>", "<script>alert(1)</script></body>"),
    ],
    [
      "remote request",
      "index.html",
      (content: string) => content.replace("tel:5550100", "https://attacker.example/collect"),
    ],
    [
      "event handler",
      "index.html",
      (content: string) => content.replace("<main>", '<main onclick="alert(1)">'),
    ],
    [
      "link ping request",
      "index.html",
      (content: string) =>
        content.replace("href=\"tel:5550100\"", 'href="tel:5550100" ping="https://attacker.example/collect"'),
    ],
    [
      "inline style expansion",
      "index.html",
      (content: string) =>
        content.replace("<main>", '<main style="background-image:url(https://attacker.example/x)">'),
    ],
    [
      "structural expansion",
      "index.html",
      (content: string) => content.replace("<h1 ", "<div><h1 ").replace("</h1>", "</h1></div>"),
    ],
    [
      "remote CSS import",
      "tokens.css",
      (content: string) => `@import url(https://attacker.example/a.css);\n${content}`,
    ],
    [
      "new CSS selector",
      "tokens.css",
      (content: string) => `${content}\nbody { background-image: url(https://attacker.example/x); }\n`,
    ],
    [
      "escaped CSS request",
      "tokens.css",
      (content: string) =>
        content.replace("#ffffff", "\\75rl(https://attacker.example/x)"),
    ],
  ])("rejects repair output with %s", async (_label, repairPath, mutate) => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const before = await snapshotTree(candidate.paths.root);

    await expect(
      repairFailedCandidate(runId, async (request) => {
        const original = request.files.find((file) => file.path === repairPath)!;
        return {
          files: [{ ...original, content: mutate(original.content) }],
        };
      }),
    ).rejects.toThrow(/repair|structure|script|remote|data-edit-id|CSS/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
  });

  it("treats identical provider output as no repair and releases the allowance", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const before = await snapshotTree(candidate.paths.root);

    await expect(
      repairFailedCandidate(runId, async (request) => ({
        files: [request.files.find((file) => file.path === "tokens.css")!],
      })),
    ).resolves.toBeUndefined();

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
    expect(gateHarness.state.contrastCalls).toHaveLength(1);
  });

  it("rejects aggregate provider output over the repair text budget", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const before = await snapshotTree(candidate.paths.root);

    await expect(
      repairFailedCandidate(runId, async () => ({
        files: [{ path: "tokens.css", content: "x".repeat(1024 * 1024 + 1) }],
      })),
    ).rejects.toThrow(/repair.*size|repair.*bytes|too big/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
  });

  it("rejects oversized repair inputs before claiming or calling the provider", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const indexPath = path.join(candidate.paths.site, "index.html");
    await fs.appendFile(indexPath, `<!--${"x".repeat(1024 * 1024)}-->`);
    await rebindFailedCandidate(runId);

    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("provider must not run");
      }),
    ).rejects.toThrow(/repair.*input.*size|repair.*input.*bytes|too big/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
  });

  it("detects provider-time candidate substitution and releases the allowance", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const tokensPath = path.join(candidate.paths.site, "tokens.css");

    await expect(
      repairFailedCandidate(runId, async (request) => {
        await fs.appendFile(tokensPath, "\n/* substituted during provider */\n");
        const tokens = request.files.find((file) => file.path === "tokens.css")!;
        return {
          files: [{ ...tokens, content: `${tokens.content}\n/* proposed */\n` }],
        };
      }),
    ).rejects.toThrow(/candidate|mismatch|changed/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
  });

  it("releases the allowance and preserves exact bytes when staging a repair fails", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const before = await snapshotTree(candidate.paths.root);
    const realWriteFile = fs.writeFile.bind(fs);
    vi.spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      if (
        path.basename(String(file)) === "tokens.css" &&
        String(file) !== path.join(candidate.paths.site, "tokens.css")
      ) {
        throw new Error("seeded repair write failure");
      }
      return realWriteFile(file, data, options);
    });

    await expect(
      repairFailedCandidate(runId, async (request) => ({
        files: request.files
          .filter((file) => file.path === "tokens.css")
          .map((file) => ({
            ...file,
            content: `${file.content}\n/* seeded write */\n`,
          })),
      })),
    ).rejects.toThrow("seeded repair write failure");

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
  });

  it("restores the failed candidate and releases the allowance when bundle commit fails", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const live = await writeLiveSentinels(runId);
    const approvedEvidence = path.join(
      sitePaths(runId).root,
      "evidence",
      "approved",
      "visual-qa.json",
    );
    await fs.mkdir(path.dirname(approvedEvidence), { recursive: true });
    await fs.writeFile(approvedEvidence, "approved-evidence-sentinel");
    const evidenceBefore = await fs.readFile(approvedEvidence);
    const before = await snapshotTree(candidate.paths.root);
    const realRename = fs.rename.bind(fs);
    let seeded = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (!seeded && String(to) === candidate.paths.root) {
        seeded = true;
        throw new Error("seeded repair bundle commit failure");
      }
      return realRename(from, to);
    });

    await expect(
      repairFailedCandidate(runId, async (request) => ({
        files: request.files
          .filter((file) => file.path === "tokens.css")
          .map((file) => ({
            ...file,
            content: `${file.content}\n/* seeded commit */\n`,
          })),
      })),
    ).rejects.toThrow("seeded repair bundle commit failure");

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), before);
    expect(await fs.readFile(approvedEvidence)).toEqual(evidenceBefore);
    await expectLiveSentinels(runId, live);
  });

  it("revalidates the retired source bundle immediately before repair commit", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const realRename = fs.rename.bind(fs);
    let substituted = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (!substituted && String(from) === candidate.paths.root) {
        substituted = true;
        await fs.appendFile(
          path.join(candidate.paths.site, "tokens.css"),
          "\n/* substituted before rename */\n",
        );
      }
      return realRename(from, to);
    });

    await expect(
      repairFailedCandidate(runId, async (request) => {
        const tokens = request.files.find((file) => file.path === "tokens.css")!;
        return {
          files: [{ ...tokens, content: `${tokens.content}\n/* proposed */\n` }],
        };
      }),
    ).rejects.toThrow(/candidate.*changed|source.*changed|mismatch/i);

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(0);
    expect(await fs.readFile(path.join(candidate.paths.site, "tokens.css"), "utf8"))
      .toContain("substituted before rename");
    expect(await fs.readFile(path.join(candidate.paths.site, "tokens.css"), "utf8"))
      .not.toContain("/* proposed */");
  });

  it("releases provider failures but consumes a completed repair that still fails gates", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const first = await createFailedRepairCandidate();

    await expect(
      repairFailedCandidate(first.runId, async () => {
        throw new Error("provider unavailable");
      }),
    ).rejects.toThrow("provider unavailable");
    expect((await loadRun(first.runId)).stages.built.gateRepairAttempts).toBe(0);

    const result = await repairFailedCandidate(first.runId, async (request) => ({
      files: request.files
        .filter((file) => file.path === "tokens.css")
        .map((file) => ({ ...file, content: `${file.content}\n/* no-op repair */\n` })),
    }));
    expect(result?.state).toBe("failed");
    expect((await loadRun(first.runId)).stages.built.gateRepairAttempts).toBe(1);
    expect(gateHarness.state.contrastCalls).toHaveLength(2);

    await expect(
      repairFailedCandidate(first.runId, async () => {
        throw new Error("completed repair must not repeat");
      }),
    ).resolves.toBeUndefined();
    expect((await loadRun(first.runId)).stages.built.gateRepairAttempts).toBe(1);

    const candidateBeforeReconnect = await snapshotTree(first.candidate.paths.root);
    const executePipeline = vi.fn(async () => {
      throw new Error("reconnect must not rebuild or call the provider");
    });
    await runPipeline(first.runId, vi.fn(), {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun,
      loadArtifact: vi.fn().mockResolvedValue({
        businessName: "Candidate Co",
        category: "service",
        location: "Portland, OR",
        services: ["Service"],
        phone: "555-0100",
        primaryAction: "call",
        projectTarget: "website",
        certifications: [],
        claims: [],
        vibeWords: [],
        research: {
          enabled: false,
          businessIntelligence: false,
          referoDesignEvidence: false,
          allowPaidFirecrawlFallback: false,
        },
        uploads: [],
      }),
      appendEvent: vi.fn(),
      inspectCandidate: async () =>
        (await import("./candidate")).inspectCandidate(first.runId),
      executePipeline,
    });
    expect(executePipeline).not.toHaveBeenCalled();
    expectTreeSnapshot(
      await snapshotTree(first.candidate.paths.root),
      candidateBeforeReconnect,
    );
  });

  it("replays only the current build error when reconnecting to a consumed failed repair", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const provider = vi.fn(async (request: RepairRequest) => ({
      files: request.files
        .filter((file) => file.path === "tokens.css")
        .map((file) => ({ ...file, content: `${file.content}\n/* completed */\n` })),
    }));
    expect((await repairFailedCandidate(runId, provider))?.state).toBe("failed");
    const providerCallsBeforeReconnect = provider.mock.calls.length;
    const gateCallsBeforeReconnect = gateHarness.state.contrastCalls.length;
    const candidateBeforeReconnect = await snapshotTree(candidate.paths.root);
    const staleError: PipelineEvent = {
      type: "error",
      message: "stale earlier scan failure",
    };
    const currentBuildError: PipelineEvent = {
      type: "error",
      message: "blocking candidate gates failed: contrast",
    };
    const emit = vi.fn();
    const executePipeline = vi.fn(async () => {
      throw new Error("reconnect must not rebuild or call the provider");
    });

    await runPipeline(runId, emit, {
      readEvents: vi.fn().mockResolvedValue([
        staleError,
        {
          type: "card",
          stage: "built",
          title: "Gates: 1 still blocking failure(s)",
          body: "contrast failed",
        },
        currentBuildError,
      ]),
      loadRun,
      loadArtifact: vi.fn().mockResolvedValue({
        businessName: "Candidate Co",
        category: "service",
        location: "Portland, OR",
        services: ["Service"],
        phone: "555-0100",
        primaryAction: "call",
        projectTarget: "website",
        certifications: [],
        claims: [],
        vibeWords: [],
        research: {
          enabled: false,
          businessIntelligence: false,
          referoDesignEvidence: false,
          allowPaidFirecrawlFallback: false,
        },
        uploads: [],
      }),
      appendEvent: vi.fn(),
      inspectCandidate: async () =>
        (await import("./candidate")).inspectCandidate(runId),
      executePipeline,
    });

    expect(executePipeline).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledTimes(providerCallsBeforeReconnect);
    expect(gateHarness.state.contrastCalls).toHaveLength(gateCallsBeforeReconnect);
    expect(emit).toHaveBeenCalledWith(currentBuildError);
    expect(emit).not.toHaveBeenCalledWith(staleError);
    expectTreeSnapshot(await snapshotTree(candidate.paths.root), candidateBeforeReconnect);
  });

  it("consumes the allowance when repaired-candidate gate execution fails", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();

    await expect(
      repairFailedCandidate(runId, async (request) => {
        gateHarness.state.gotoError = new Error("repaired candidate gate crashed");
        const tokens = request.files.find((file) => file.path === "tokens.css")!;
        return {
          files: [{ ...tokens, content: `${tokens.content}\n/* completed */\n` }],
        };
      }),
    ).rejects.toThrow("repaired candidate gate crashed");

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(1);
    expect(JSON.parse(await fs.readFile(candidate.paths.provenance, "utf8")))
      .toMatchObject({ state: "failed" });
    gateHarness.state.gotoError = undefined;
    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("completed repair must not call provider twice");
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed and consumes the allowance when repaired disposition publication fails", async () => {
    const { repairFailedCandidate } = candidateRepairApi();
    const { runId, candidate } = await createFailedRepairCandidate();
    const realRename = fs.rename.bind(fs);
    let seeded = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (
        !seeded &&
        String(to) === candidate.paths.provenance &&
        String(from).includes(".candidate-provenance.")
      ) {
        seeded = true;
        throw new Error("repaired disposition publication failed");
      }
      return realRename(from, to);
    });

    await expect(
      repairFailedCandidate(runId, async (request) => {
        const tokens = request.files.find((file) => file.path === "tokens.css")!;
        return {
          files: [{ ...tokens, content: `${tokens.content}\n/* completed */\n` }],
        };
      }),
    ).rejects.toThrow("repaired disposition publication failed");

    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(1);
    expect(JSON.parse(await fs.readFile(candidate.paths.provenance, "utf8")))
      .toMatchObject({ state: "failed" });
    await expect(
      repairFailedCandidate(runId, async () => {
        throw new Error("completed repair must not call provider twice");
      }),
    ).resolves.toBeUndefined();
  });
});
