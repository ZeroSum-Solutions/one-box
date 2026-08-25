import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CANDIDATE_BYTES,
  candidateManifestSha256,
  cleanupCandidateDiagnostics,
  createCandidateManifest,
  inspectCandidate,
  recoverCandidateState,
  transitionCandidateProvenance,
  validateCandidateInputArtifactHashes,
  validateCandidateInventory,
} from "./candidate";
import {
  CandidateManifestV1Schema,
  CandidateProvenanceV1Schema,
  type CandidateManifestV1,
  type CandidateProvenanceV1,
} from "./contracts";
import { candidatePaths, sitePaths } from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const runIds: string[] = [];
const HASH_A = "a".repeat(64);

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function temporarySite(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-candidate-"));
  roots.push(root);
  return root;
}

function testRunId(prefix = "candidate-test"): string {
  const runId = `${prefix}-${process.pid}-${runIds.length}`;
  runIds.push(runId);
  const root = sitePaths(runId).root;
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "run.json"),
    JSON.stringify({
      id: runId,
      createdAt: "2026-08-22T00:00:00.000Z",
      stages: Object.fromEntries(
        ["intake", "scanned", "locked", "synthesized", "built", "edited"].map(
          (stage) => [stage, { status: "pending", retries: 0 }],
        ),
      ),
      modelSlugs: {},
      layoutAuthority: "template-v1",
    }),
  );
  return runId;
}

function provenance(
  runId: string,
  overrides: Partial<CandidateProvenanceV1> = {},
): CandidateProvenanceV1 {
  return CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: "candidate-v1",
    runId,
    createdAt: "2026-08-22T00:00:00.000Z",
    state: "preparing",
    history: [
      { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
    ],
    inputArtifactHashes: [
      { path: "evidence/design-contract.json", sha256: HASH_A },
    ],
    layoutAuthority: "template-v1",
    compilerVersion: "template-compiler@1",
    ...overrides,
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function createReadyCandidate(runId: string) {
  const paths = candidatePaths(runId);
  await fs.mkdir(path.join(paths.site, "assets"), { recursive: true });
  await fs.writeFile(path.join(paths.site, "index.html"), "<h1>Ready</h1>");
  await fs.writeFile(path.join(paths.site, "assets", "site.css"), "h1{}\n");
  const manifest = await createCandidateManifest(paths.site);
  await writeJson(paths.manifest, manifest);
  const ready = transitionCandidateProvenance(
    provenance(runId),
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

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    ...roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
    ...runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  ]);
});

describe("candidate paths", () => {
  it("derives one closed candidate root after validating the run id", () => {
    const paths = candidatePaths("safe-run_123");
    const root = path.join(
      process.cwd(),
      "sites",
      "safe-run_123",
      "candidate",
    );
    expect(paths).toEqual({
      root,
      site: path.join(root, "site"),
      manifest: path.join(root, "manifest.json"),
      provenance: path.join(root, "provenance.json"),
      gates: path.join(root, "gates.json"),
    });
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it.each([
    "",
    "abc",
    "../escape",
    "/absolute",
    "C:\\escape",
    "safe/run",
    "safe\\run",
    "nul\0run",
  ])("rejects hostile run id %j before joining", (runId) => {
    expect(() => candidatePaths(runId)).toThrow(/runId/);
  });
});

describe("candidate inventory", () => {
  it("opens candidate files with nonblocking no-follow reads", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "index.html"), "index");
    const realOpen = fs.open.bind(fs);
    const observedFlags: number[] = [];
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      if (typeof flags === "number") observedFlags.push(flags);
      return realOpen(filePath, flags, mode);
    });

    await createCandidateManifest(root);

    const nonblock = constants.O_NONBLOCK ?? 0;
    if (nonblock !== 0) {
      expect(observedFlags.length).toBeGreaterThan(0);
      expect(observedFlags.every((flags) => (flags & nonblock) === nonblock)).toBe(
        true,
      );
    }
  });

  it("rejects opened aggregate growth before reading the grown file body", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "index.html"), "index");
    const largePath = path.join(root, "z.bin");
    const sparse = await fs.open(largePath, "w");
    await sparse.truncate(MAX_CANDIDATE_BYTES - 5);
    await sparse.close();

    const realOpen = fs.open.bind(fs);
    let grew = false;
    let bodyReadAttempted = false;
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      if (String(filePath) !== largePath || grew) {
        return realOpen(filePath, flags, mode);
      }
      grew = true;
      const grow = await realOpen(largePath, "r+");
      await grow.truncate(MAX_CANDIDATE_BYTES - 4);
      await grow.close();
      const opened = await realOpen(filePath, flags, mode);
      opened.read = (async () => {
        bodyReadAttempted = true;
        throw new Error("candidate file body read attempted");
      }) as typeof opened.read;
      return opened;
    });

    await expect(createCandidateManifest(root)).rejects.toThrow(/100 MiB/);
    expect(bodyReadAttempted).toBe(false);
  });

  it("is deterministic across creation order and mtime", async () => {
    const first = await temporarySite();
    const second = await temporarySite();
    await fs.mkdir(path.join(first, "assets"));
    await fs.writeFile(path.join(first, "index.html"), "index");
    await fs.writeFile(path.join(first, "assets", "site.css"), "css");
    await fs.mkdir(path.join(second, "assets"));
    await fs.writeFile(path.join(second, "assets", "site.css"), "css");
    await fs.writeFile(path.join(second, "index.html"), "index");
    await fs.utimes(
      path.join(second, "index.html"),
      new Date("2020-01-01T00:00:00.000Z"),
      new Date("2020-01-01T00:00:00.000Z"),
    );

    const firstManifest = await createCandidateManifest(first);
    const secondManifest = await createCandidateManifest(second);

    expect(firstManifest).toEqual(secondManifest);
    expect(firstManifest.files.map((file) => file.path)).toEqual([
      "assets/site.css",
      "index.html",
    ]);
    expect(firstManifest.totalBytes).toBe(8);
    expect(candidateManifestSha256(firstManifest)).toBe(
      candidateManifestSha256(secondManifest),
    );
  });

  it("requires index.html", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "other.html"), "other");
    await expect(createCandidateManifest(root)).rejects.toThrow(/index\.html/);
  });

  it("rejects missing, unexpected, size-mismatched, hash-mismatched, and build-mismatched files", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "index.html"), "index");
    const manifest = await createCandidateManifest(root);

    await fs.writeFile(path.join(root, "unexpected.css"), "x");
    await expect(validateCandidateInventory(root, manifest)).rejects.toThrow(
      /unexpected/,
    );
    await fs.rm(path.join(root, "unexpected.css"));

    await fs.rm(path.join(root, "index.html"));
    await expect(validateCandidateInventory(root, manifest)).rejects.toThrow(
      /missing/,
    );
    await fs.writeFile(path.join(root, "index.html"), "longer");
    await expect(validateCandidateInventory(root, manifest)).rejects.toThrow(
      /size/,
    );
    await fs.writeFile(path.join(root, "index.html"), "other");
    await expect(validateCandidateInventory(root, manifest)).rejects.toThrow(
      /SHA-256/,
    );
    await fs.writeFile(path.join(root, "index.html"), "index");
    await expect(
      validateCandidateInventory(root, {
        ...manifest,
        buildSha256: "f".repeat(64),
      }),
    ).rejects.toThrow(/build SHA-256/);
  });

  it("rejects symlinked files, symlinked directories, directory records, and hardlink aliases", async () => {
    const outside = await temporarySite();
    await fs.writeFile(path.join(outside, "outside.css"), "outside");

    const fileLinkRoot = await temporarySite();
    await fs.writeFile(path.join(fileLinkRoot, "index.html"), "index");
    await fs.symlink(
      path.join(outside, "outside.css"),
      path.join(fileLinkRoot, "linked.css"),
    );
    await expect(createCandidateManifest(fileLinkRoot)).rejects.toThrow(
      /symlink/,
    );

    const directoryLinkRoot = await temporarySite();
    await fs.writeFile(path.join(directoryLinkRoot, "index.html"), "index");
    await fs.symlink(outside, path.join(directoryLinkRoot, "linked-assets"));
    await expect(createCandidateManifest(directoryLinkRoot)).rejects.toThrow(
      /symlink/,
    );

    const directoryRecordRoot = await temporarySite();
    await fs.mkdir(path.join(directoryRecordRoot, "assets"));
    await fs.writeFile(path.join(directoryRecordRoot, "index.html"), "index");
    const base = await createCandidateManifest(directoryRecordRoot);
    const directoryRecord = CandidateManifestV1Schema.parse({
      ...base,
      files: [
        { path: "assets", sizeBytes: 0, sha256: sha256("") },
        ...base.files,
      ],
    });
    await expect(
      validateCandidateInventory(directoryRecordRoot, directoryRecord),
    ).rejects.toThrow(/regular file/);

    const hardlinkRoot = await temporarySite();
    await fs.writeFile(path.join(hardlinkRoot, "index.html"), "index");
    await fs.link(
      path.join(hardlinkRoot, "index.html"),
      path.join(hardlinkRoot, "alias.html"),
    );
    await expect(createCandidateManifest(hardlinkRoot)).rejects.toThrow(
      /hardlink/,
    );
  });

  it("rejects FIFO filesystem objects", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "index.html"), "index");
    await execFileAsync("mkfifo", [path.join(root, "pipe")]);
    await expect(createCandidateManifest(root)).rejects.toThrow(/regular file/);
  });

  it("rejects socket filesystem objects", async () => {
    const root = await temporarySite();
    await fs.writeFile(path.join(root, "index.html"), "index");
    const socketPath = path.join(root, "candidate.sock");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      await expect(createCandidateManifest(root)).rejects.toThrow(
        /regular file/,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("accepts exactly 100 MiB and rejects one byte over without allocating it in memory", async () => {
    const root = await temporarySite();
    const index = await fs.open(path.join(root, "index.html"), "w");
    await index.truncate(MAX_CANDIDATE_BYTES);
    await index.close();

    const atLimit = await createCandidateManifest(root);
    expect(atLimit.totalBytes).toBe(100 * 1024 * 1024);

    const oversized = await fs.open(path.join(root, "index.html"), "r+");
    await oversized.truncate(MAX_CANDIDATE_BYTES + 1);
    await oversized.close();
    await expect(createCandidateManifest(root)).rejects.toThrow(/100 MiB/);
  });
});

describe("candidate inspection and transitions", () => {
  it("rejects a bound nested input reached through a symlinked directory", async () => {
    const runId = testRunId("candidate-input-parent-link");
    const outside = await temporarySite();
    const bytes = Buffer.from("outside-hero-bytes");
    await fs.writeFile(path.join(outside, "hero.jpg"), bytes);
    const assets = path.join(sitePaths(runId).root, "assets");
    await fs.mkdir(assets);
    await fs.symlink(outside, path.join(assets, "nested"));

    await expect(
      validateCandidateInputArtifactHashes(runId, [
        {
          path: "assets/nested/hero.jpg",
          sha256: sha256(bytes),
        },
      ]),
    ).rejects.toThrow(/input|symlink|authority|unavailable/i);
  });

  it("rejects provenance growth between lstat and open before reading its body", async () => {
    const runId = testRunId("candidate-provenance-grow");
    const { paths } = await createReadyCandidate(runId);
    const realOpen = fs.open.bind(fs);
    let grew = false;
    let bodyReadAttempted = false;
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      if (String(filePath) !== paths.provenance || grew) {
        return realOpen(filePath, flags, mode);
      }
      grew = true;
      const grow = await realOpen(paths.provenance, "a");
      await grow.writeFile(" ");
      await grow.close();
      const opened = await realOpen(filePath, flags, mode);
      opened.readFile = (async () => {
        bodyReadAttempted = true;
        throw new Error("candidate provenance body read attempted");
      }) as typeof opened.readFile;
      return opened;
    });

    await expect(inspectCandidate(runId)).rejects.toThrow(/changed before read/);
    expect(bodyReadAttempted).toBe(false);
  });

  it("does not use an unbounded read when provenance grows after the opened stat", async () => {
    const runId = testRunId("candidate-post-stat-grow");
    const { paths } = await createReadyCandidate(runId);
    const realOpen = fs.open.bind(fs);
    let armed = true;
    let unboundedReadAttempted = false;
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      const opened = await realOpen(filePath, flags, mode);
      if (String(filePath) !== paths.provenance || !armed) return opened;
      armed = false;
      const realStat = opened.stat.bind(opened);
      const realReadFile = opened.readFile.bind(opened);
      let firstStat = true;
      opened.stat = (async (options) => {
        const observed = await realStat(options);
        if (firstStat) {
          firstStat = false;
          const grow = await realOpen(paths.provenance, "a");
          await grow.writeFile(" ");
          await grow.close();
        }
        return observed;
      }) as typeof opened.stat;
      opened.readFile = (async (...args: Parameters<typeof realReadFile>) => {
        unboundedReadAttempted = true;
        return realReadFile(...args);
      }) as typeof opened.readFile;
      return opened;
    });

    await expect(inspectCandidate(runId)).rejects.toThrow(/changed while read/);
    expect(unboundedReadAttempted).toBe(false);
  });

  it("reads and verifies a ready candidate without writing recovery state", async () => {
    const runId = testRunId();
    const { paths, manifest, ready } = await createReadyCandidate(runId);
    const before = await fs.readFile(paths.provenance);

    await expect(inspectCandidate(runId)).resolves.toMatchObject({
      status: "present",
      manifest,
      provenance: ready,
    });
    expect(await fs.readFile(paths.provenance)).toEqual(before);
  });

  it("blocks inspection and recovery on persisted authority mismatch without mutating candidate, live, or report", async () => {
    const runId = testRunId("candidate-authority-mismatch");
    const { paths } = await createReadyCandidate(runId);
    await fs.mkdir(sitePaths(runId).site, { recursive: true });
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "last-known-good");
    const runFile = path.join(sitePaths(runId).root, "run.json");
    const run = JSON.parse(await fs.readFile(runFile, "utf8"));
    run.layoutAuthority = "page-ir-v1";
    await fs.writeFile(runFile, JSON.stringify(run));
    const beforeProvenance = await fs.readFile(paths.provenance);
    const beforeLive = await fs.readFile(path.join(sitePaths(runId).site, "index.html"));

    await expect(inspectCandidate(runId)).rejects.toThrow(
      "candidate provenance requires template-v1 authority",
    );
    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringContaining("candidate provenance requires template-v1 authority"),
    });
    expect(await fs.readFile(paths.provenance)).toEqual(beforeProvenance);
    expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"))).toEqual(beforeLive);
    await expect(
      fs.stat(path.join(sitePaths(runId).root, "candidate-recovery.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks Page IR provenance on a template run and preserves run, candidate, live, and report bytes", async () => {
    const runId = testRunId("candidate-authority-inverse");
    const { paths, ready } = await createReadyCandidate(runId);
    await fs.mkdir(sitePaths(runId).site, { recursive: true });
    const livePath = path.join(sitePaths(runId).site, "index.html");
    await fs.writeFile(livePath, "last-known-good");
    const pageIrReady = CandidateProvenanceV1Schema.parse({
      ...ready,
      layoutAuthority: "page-ir-v1",
      pageIrSha256: "c".repeat(64),
    });
    await writeJson(paths.provenance, pageIrReady);
    const runPath = path.join(sitePaths(runId).root, "run.json");
    const before = {
      run: await fs.readFile(runPath),
      provenance: await fs.readFile(paths.provenance),
      manifest: await fs.readFile(paths.manifest),
      index: await fs.readFile(path.join(paths.site, "index.html")),
      live: await fs.readFile(livePath),
    };

    await expect(inspectCandidate(runId)).rejects.toThrow(
      "candidate provenance requires page-ir-v1 authority",
    );
    await expect(recoverCandidateState(runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringContaining("candidate provenance requires page-ir-v1 authority"),
    });
    expect(await fs.readFile(runPath)).toEqual(before.run);
    expect(await fs.readFile(paths.provenance)).toEqual(before.provenance);
    expect(await fs.readFile(paths.manifest)).toEqual(before.manifest);
    expect(await fs.readFile(path.join(paths.site, "index.html"))).toEqual(before.index);
    expect(await fs.readFile(livePath)).toEqual(before.live);
    await expect(fs.stat(path.join(sitePaths(runId).root, "candidate-recovery.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("binds promotable inspection to candidate-scoped gates", async () => {
    const runId = testRunId();
    const { paths, ready } = await createReadyCandidate(runId);
    const gates = Buffer.from('[{"gate":"axe","pass":true}]');
    await fs.writeFile(paths.gates, gates);
    const promotable = transitionCandidateProvenance(
      ready,
      "promotable",
      "2026-08-22T00:00:02.000Z",
      { gateReportSha256: sha256(gates) },
    );
    await writeJson(paths.provenance, promotable);

    await expect(inspectCandidate(runId)).resolves.toMatchObject({
      status: "present",
      provenance: promotable,
    });
    await fs.writeFile(paths.gates, "tampered");
    await expect(inspectCandidate(runId)).rejects.toThrow(/gate report SHA-256/);
  });

  it("fails closed on manifest hash mismatch, malformed provenance, and symlinked provenance", async () => {
    const runId = testRunId();
    const { paths } = await createReadyCandidate(runId);
    const manifest = JSON.parse(
      await fs.readFile(paths.manifest, "utf8"),
    ) as CandidateManifestV1;
    await writeJson(paths.manifest, {
      ...manifest,
      buildSha256: "e".repeat(64),
    });
    await expect(inspectCandidate(runId)).rejects.toThrow(/manifest SHA-256/);

    await fs.writeFile(paths.provenance, "not-json");
    await expect(inspectCandidate(runId)).rejects.toThrow();

    await fs.rm(paths.provenance);
    const outside = path.join(await temporarySite(), "provenance.json");
    await writeJson(outside, provenance(runId));
    await fs.symlink(outside, paths.provenance);
    await expect(inspectCandidate(runId)).rejects.toThrow(/symlink/);
  });

  it("reports an absent candidate without creating it", async () => {
    const runId = testRunId();
    await expect(inspectCandidate(runId)).resolves.toEqual({
      status: "absent",
      paths: candidatePaths(runId),
    });
    await expect(fs.stat(candidatePaths(runId).root)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("candidate diagnostic cleanup", () => {
  async function writeDiagnostic(
    runId: string,
    state: "failed" | "abandoned" | "preparing",
    transitionedAt: string,
  ) {
    const paths = candidatePaths(runId);
    await fs.mkdir(paths.site, { recursive: true });
    await fs.writeFile(path.join(paths.site, "diagnostic.txt"), "diagnostic");
    const history = [
      { state: "preparing" as const, at: "2026-08-20T00:00:00.000Z" },
      ...(state === "preparing"
        ? []
        : [{ state, at: transitionedAt }]),
    ];
    await writeJson(
      paths.provenance,
      provenance(runId, {
        createdAt: history[0].at,
        state,
        history,
      }),
    );
    return paths;
  }

  it("does not remove diagnostics while another site-authority owner is active", async () => {
    const runId = testRunId("candidate-cleanup-authority");
    const paths = await writeDiagnostic(
      runId,
      "failed",
      "2026-08-20T00:00:00.000Z",
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const owner = withSiteAuthorityLock(runId, async () => {
      entered();
      await held;
    });
    await acquired;

    let settled = false;
    const cleanup = cleanupCandidateDiagnostics(
      runId,
      new Date("2026-08-22T00:00:00.000Z"),
    ).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(settled).toBe(false);
    await expect(fs.stat(paths.root)).resolves.toBeDefined();
    release();
    await owner;
    await expect(cleanup).resolves.toEqual({ removed: true, reason: "expired" });
  });

  it("keeps a terminal diagnostic exactly 24 hours old and removes it one millisecond later", async () => {
    const now = new Date("2026-08-22T00:00:00.000Z");
    const exactRun = testRunId("candidate-exact");
    const exactPaths = await writeDiagnostic(
      exactRun,
      "failed",
      "2026-08-21T00:00:00.000Z",
    );
    await expect(cleanupCandidateDiagnostics(exactRun, now)).resolves.toEqual({
      removed: false,
      reason: "within-retention",
    });
    await expect(fs.stat(exactPaths.root)).resolves.toBeDefined();

    const staleRun = testRunId("candidate-stale");
    const stalePaths = await writeDiagnostic(
      staleRun,
      "abandoned",
      "2026-08-20T23:59:59.999Z",
    );
    await expect(cleanupCandidateDiagnostics(staleRun, now)).resolves.toEqual({
      removed: true,
      reason: "expired",
    });
    await expect(fs.stat(stalePaths.root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes recent terminal diagnostics over 100 MiB and preserves every sibling byte", async () => {
    const runId = testRunId("candidate-oversize");
    const paths = await writeDiagnostic(
      runId,
      "failed",
      "2026-08-21T23:59:59.000Z",
    );
    const sparse = await fs.open(path.join(paths.site, "oversized.bin"), "w");
    await sparse.truncate(MAX_CANDIDATE_BYTES + 1);
    await sparse.close();

    const siblings = {
      site: path.join(sitePaths(runId).site, "index.html"),
      gates: path.join(sitePaths(runId).root, "gates.json"),
      upload: path.join(sitePaths(runId).uploads, "claimed.bin"),
      research: path.join(sitePaths(runId).research, "scan.json"),
      evidence: path.join(sitePaths(runId).root, "evidence", "ledger.json"),
    };
    for (const [name, filePath] of Object.entries(siblings)) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `preserve-${name}`);
    }

    await expect(
      cleanupCandidateDiagnostics(
        runId,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).resolves.toEqual({ removed: true, reason: "oversized" });
    for (const [name, filePath] of Object.entries(siblings)) {
      expect(await fs.readFile(filePath, "utf8")).toBe(`preserve-${name}`);
    }
  });

  it("never removes an active candidate and fails closed on malformed or symlinked provenance", async () => {
    const activeRun = testRunId("candidate-active");
    const activePaths = await writeDiagnostic(
      activeRun,
      "preparing",
      "2026-08-20T00:00:00.000Z",
    );
    const sparse = await fs.open(path.join(activePaths.site, "large.bin"), "w");
    await sparse.truncate(MAX_CANDIDATE_BYTES + 1);
    await sparse.close();
    await expect(
      cleanupCandidateDiagnostics(
        activeRun,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).resolves.toEqual({ removed: false, reason: "active" });
    await expect(fs.stat(activePaths.root)).resolves.toBeDefined();

    const malformedRun = testRunId("candidate-malformed");
    const malformedPaths = await writeDiagnostic(
      malformedRun,
      "failed",
      "2026-08-20T00:00:00.000Z",
    );
    await fs.writeFile(malformedPaths.provenance, "bad-json");
    await expect(
      cleanupCandidateDiagnostics(
        malformedRun,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).rejects.toThrow();
    await expect(fs.stat(malformedPaths.root)).resolves.toBeDefined();

    const symlinkRun = testRunId("candidate-symlink");
    const symlinkPaths = await writeDiagnostic(
      symlinkRun,
      "failed",
      "2026-08-20T00:00:00.000Z",
    );
    const outside = path.join(await temporarySite(), "provenance.json");
    await fs.rename(symlinkPaths.provenance, outside);
    await fs.symlink(outside, symlinkPaths.provenance);
    await expect(
      cleanupCandidateDiagnostics(
        symlinkRun,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).rejects.toThrow(/symlink/);
    await expect(fs.stat(symlinkPaths.root)).resolves.toBeDefined();
  });

  it("preserves a terminal candidate revived while cleanup is in progress", async () => {
    const runId = testRunId("candidate-revived");
    const paths = await writeDiagnostic(
      runId,
      "failed",
      "2026-08-20T00:00:01.000Z",
    );
    const failed = CandidateProvenanceV1Schema.parse(
      JSON.parse(await fs.readFile(paths.provenance, "utf8")),
    );
    const revived = transitionCandidateProvenance(
      failed,
      "preparing",
      "2026-08-20T00:00:02.000Z",
    );
    const realLstat = fs.lstat.bind(fs);
    let rootChecks = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (filePath, options) => {
      if (String(filePath) === paths.root) {
        rootChecks += 1;
        if (rootChecks === 2) await writeJson(paths.provenance, revived);
      }
      return realLstat(filePath, options);
    });

    await expect(
      cleanupCandidateDiagnostics(
        runId,
        new Date("2026-08-22T00:00:00.000Z"),
      ),
    ).rejects.toThrow(/provenance changed during cleanup/);
    await expect(fs.stat(paths.root)).resolves.toBeDefined();
    expect(
      CandidateProvenanceV1Schema.parse(
        JSON.parse(await fs.readFile(paths.provenance, "utf8")),
      ).state,
    ).toBe("preparing");
  });
});
