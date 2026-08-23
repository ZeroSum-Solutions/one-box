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
import {
  CandidateProvenanceV1Schema,
  type CandidateProvenanceV1,
} from "./contracts";
import { runCandidateGates } from "./gates";
import { candidatePaths, sitePaths } from "./runstate";

const gateHarness = vi.hoisted(() => {
  const state = {
    navigationUrls: [] as string[],
    contrastCalls: [] as Array<{ url: string; siteDir: string }>,
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
    reset() {
      state.navigationUrls.length = 0;
      state.contrastCalls.length = 0;
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
  await fs.mkdir(sitePaths(runId).site, { recursive: true });
  await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), liveIndex);
  await fs.writeFile(path.join(sitePaths(runId).root, "gates.json"), liveGates);
  return { liveIndex, liveGates };
}

async function expectLiveSentinels(
  runId: string,
  sentinels: Awaited<ReturnType<typeof writeLiveSentinels>>,
) {
  expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"))).toEqual(
    sentinels.liveIndex,
  );
  expect(await fs.readFile(path.join(sitePaths(runId).root, "gates.json"))).toEqual(
    sentinels.liveGates,
  );
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
    expect(result.receipt).toMatchObject({
      schemaVersion: 1,
      runId,
      candidateManifestSha256: candidateManifestSha256(manifest),
      buildSha256: manifest.buildSha256,
    });
    expect(JSON.parse(receiptBytes.toString("utf8"))).toEqual(result.receipt);
    expect(result.gateReportSha256).toBe(sha256(receiptBytes));
    expect(gateHarness.state.navigationUrls.every(
      (url) => url === pathToFileURL(path.join(paths.site, "index.html")).href,
    )).toBe(true);
    expect(gateHarness.state.contrastCalls).toEqual([
      {
        url: pathToFileURL(path.join(paths.site, "index.html")).href,
        siteDir: paths.site,
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

  it.each([
    ["../escape", "bad runId"],
    ["abc", "bad runId"],
  ])("rejects unsafe run id %j before browser or writes", async (runId, message) => {
    await expect(runCandidateGates(runId)).rejects.toThrow(message);
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
