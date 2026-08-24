import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createVersionedManifestLock,
  readBoundedRegularFile,
  readBoundedRepositoryFile,
  validateEvaluationContract,
  validatePageIrHarnessContract,
} from "./page-ir-harness-contract.mjs";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function json(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyContractRoot(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-page-ir-contract-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "docs/eval"), { recursive: true });
  await fs.mkdir(path.join(root, "docs/tickets"), { recursive: true });
  await fs.mkdir(path.join(root, "docs/specs"), { recursive: true });
  await fs.cp(
    path.join(REPOSITORY_ROOT, "docs/eval/page-ir-safe-pipeline"),
    path.join(root, "docs/eval/page-ir-safe-pipeline"),
    { recursive: true },
  );
  await fs.cp(
    path.join(REPOSITORY_ROOT, "docs/tickets/page-ir-safe-pipeline"),
    path.join(root, "docs/tickets/page-ir-safe-pipeline"),
    { recursive: true },
  );
  await fs.copyFile(
    path.join(
      REPOSITORY_ROOT,
      "docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md",
    ),
    path.join(
      root,
      "docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md",
    ),
  );
  const registry = await json(
    path.join(root, "docs/eval/page-ir-safe-pipeline/harness-registry.json"),
  );
  const registeredTests = new Set(
    Object.values(registry.evaluations).flatMap((evaluation) =>
      evaluation.kind === "coordinator-evidence" ? [] : evaluation.testFiles ?? []
    ),
  );
  for (const relative of registeredTests) {
    const source = path.join(REPOSITORY_ROOT, ...relative.split("/"));
    const target = path.join(root, ...relative.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  return root;
}

async function refreshLock(root, lockName, dataName, versionKey) {
  const directory = path.join(root, "docs/eval/page-ir-safe-pipeline");
  const lockPath = path.join(directory, lockName);
  const lock = await json(lockPath);
  const bytes = await fs.readFile(path.join(directory, dataName));
  lock.sha256 = sha256(bytes);
  lock[versionKey] = (await json(path.join(directory, dataName)))[versionKey];
  await writeJson(lockPath, lock);
}

test("validates the frozen Page IR harness contract and every registered reference", async () => {
  const result = await validatePageIrHarnessContract(REPOSITORY_ROOT);
  assert.deepEqual(result.resultStates, ["PASS", "FAIL", "BLOCKED", "NOT_RUN"]);
  assert.equal(result.evaluationCount, 44);
  assert.equal(result.ticketCount, 22);
  assert.equal(result.credentialFreeTestCount, 10);
  assert.equal(result.contractVersion, "1.0.0");
  assert.equal(result.registryVersion, "1.5.0");
  assert.equal(result.manifest.evaluations.length, 44);
  assert.equal(result.registry.registryVersion, "1.5.0");
  assert.deepEqual(
    Object.keys(result.registry.evaluations).sort(),
    result.manifest.evaluations.map((evaluation) => evaluation.id).sort(),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(result.registry.evaluations)
        .filter(([, registration]) => registration.kind === "coordinator-evidence")
        .map(([evaluationId, registration]) => [evaluationId, registration.evaluator]),
    ),
    {
      "EVAL-SCOPE-001": "rendered-evidence",
      "EVAL-COMP-002": "rendered-evidence",
      "EVAL-UX-001": "rendered-evidence",
      "EVAL-UX-002": "rendered-evidence",
      "EVAL-UX-003": "rendered-evidence",
      "EVAL-UX-004": "rendered-evidence",
      "EVAL-UX-005": "rendered-evidence",
      "EVAL-UX-006": "rendered-evidence",
      "EVAL-QUAL-001": "qualification-human-review",
      "EVAL-QUAL-002": "qualification-human-review",
      "EVAL-QUAL-003": "qualification-human-review",
      "EVAL-OPS-002": "rendered-evidence",
      "EVAL-OPS-004": "qualification-contract",
    },
  );
  const cliContract = await validateEvaluationContract({ root: REPOSITORY_ROOT });
  assert.deepEqual(cliContract.errors, []);
  assert.equal(cliContract.manifest.evaluations.length, 44);
  assert.equal(cliContract.registry.registryVersion, "1.5.0");
  assert.equal(cliContract.manifestSha256, result.manifestSha256);
  assert.equal(cliContract.registrySha256, result.registrySha256);
});

test("CLI validation returns the manifest and registry from the validated reads", async () => {
  const manifestPath = path.join(
    REPOSITORY_ROOT,
    "docs/eval/page-ir-safe-pipeline/manifest.json",
  );
  const registryPath = path.join(
    REPOSITORY_ROOT,
    "docs/eval/page-ir-safe-pipeline/harness-registry.json",
  );
  const originalOpen = fs.open;
  const reads = new Map([
    [manifestPath, 0],
    [registryPath, 0],
  ]);
  fs.open = async (file, ...args) => {
    const resolved = path.resolve(String(file));
    if (reads.has(resolved)) reads.set(resolved, reads.get(resolved) + 1);
    return originalOpen.call(fs, file, ...args);
  };
  try {
    const result = await validateEvaluationContract({ root: REPOSITORY_ROOT });
    assert.deepEqual(result.errors, []);
    assert.equal(reads.get(manifestPath), 1);
    assert.equal(reads.get(registryPath), 1);
  } finally {
    fs.open = originalOpen;
  }
});

test("bounded contract reads reject symlinks, hardlinks, and oversized files", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-contract-read-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.json");
  const symlink = path.join(root, "symlink.json");
  const hardlink = path.join(root, "hardlink.json");
  await fs.writeFile(source, "{}\n");
  await fs.symlink(source, symlink);
  await fs.link(source, hardlink);

  await assert.rejects(readBoundedRegularFile(symlink, "symlink", 100), /symlink|regular/i);
  await assert.rejects(readBoundedRegularFile(source, "hard-linked source", 100), /hard link/i);
  await fs.unlink(hardlink);
  await fs.writeFile(source, "x".repeat(101));
  await assert.rejects(readBoundedRegularFile(source, "oversized", 100), /byte bound/i);
});

test("repository reads reject a parent directory replaced after inspection", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-contract-parent-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const trustedDirectory = path.join(root, "trusted");
  const movedDirectory = path.join(root, "trusted-original");
  const outsideDirectory = path.join(root, "outside");
  const target = path.join(trustedDirectory, "contract.json");
  await fs.mkdir(trustedDirectory);
  await fs.mkdir(outsideDirectory);
  await fs.writeFile(target, '{"source":"trusted"}\n');
  await fs.writeFile(
    path.join(outsideDirectory, "contract.json"),
    '{"source":"outside"}\n',
  );

  const originalOpen = fs.open;
  let replaced = false;
  fs.open = async (file, ...args) => {
    if (!replaced && path.resolve(String(file)) === target) {
      replaced = true;
      await fs.rename(trustedDirectory, movedDirectory);
      await fs.symlink(outsideDirectory, trustedDirectory);
    }
    return originalOpen.call(fs, file, ...args);
  };
  try {
    await assert.rejects(
      readBoundedRepositoryFile(root, "trusted/contract.json", "contract", 100),
      /parent|component|changed/i,
    );
  } finally {
    fs.open = originalOpen;
  }
});

test("rejects missing and stale manifest or registry locks", async (context) => {
  const missing = await copyContractRoot(context);
  await fs.rm(path.join(missing, "docs/eval/page-ir-safe-pipeline/manifest.lock.json"));
  await assert.rejects(validatePageIrHarnessContract(missing), /manifest lock.*unreadable/i);

  const stale = await copyContractRoot(context);
  const manifestPath = path.join(stale, "docs/eval/page-ir-safe-pipeline/manifest.json");
  await fs.appendFile(manifestPath, "\n");
  await assert.rejects(validatePageIrHarnessContract(stale), /manifest.*SHA-256/i);

  const staleRegistry = await copyContractRoot(context);
  const registryPath = path.join(staleRegistry, "docs/eval/page-ir-safe-pipeline/harness-registry.json");
  await fs.appendFile(registryPath, "\n");
  await assert.rejects(validatePageIrHarnessContract(staleRegistry), /registry.*SHA-256/i);

  const missingRegistry = await copyContractRoot(context);
  await fs.rm(
    path.join(
      missingRegistry,
      "docs/eval/page-ir-safe-pipeline/harness-registry.lock.json",
    ),
  );
  await assert.rejects(
    validatePageIrHarnessContract(missingRegistry),
    /registry lock.*unreadable/i,
  );
  const cliContract = await validateEvaluationContract({ root: missingRegistry });
  assert.equal(cliContract.errors.length, 1);
  assert.match(cliContract.errors[0], /registry lock.*unreadable/i);
});

test("rejects same-version manifest drift even when its old lock is recomputed", async (context) => {
  const root = await copyContractRoot(context);
  const manifestPath = path.join(root, "docs/eval/page-ir-safe-pipeline/manifest.json");
  const manifest = await json(manifestPath);
  manifest.evaluations[0].title = "Same version but changed contract";
  await writeJson(manifestPath, manifest);
  await refreshLock(root, "manifest.lock.json", "manifest.json", "contractVersion");
  await assert.rejects(
    validatePageIrHarnessContract(root),
    /registry pins a different evaluation manifest version or SHA-256/i,
  );
});

test("rejects closed-schema drift, missing states, traceability drift, and missing registered tests", async (context) => {
  const unknown = await copyContractRoot(context);
  const manifestPath = path.join(unknown, "docs/eval/page-ir-safe-pipeline/manifest.json");
  const manifest = await json(manifestPath);
  manifest.unapproved = true;
  await writeJson(manifestPath, manifest);
  await refreshLock(unknown, "manifest.lock.json", "manifest.json", "contractVersion");
  await assert.rejects(validatePageIrHarnessContract(unknown), /unexpected key.*unapproved/i);

  const states = await copyContractRoot(context);
  const statesPath = path.join(states, "docs/eval/page-ir-safe-pipeline/manifest.json");
  const statesManifest = await json(statesPath);
  statesManifest.resultStates = ["PASS", "FAIL", "BLOCKED"];
  await writeJson(statesPath, statesManifest);
  await refreshLock(states, "manifest.lock.json", "manifest.json", "contractVersion");
  await assert.rejects(validatePageIrHarnessContract(states), /result states/i);

  const trace = await copyContractRoot(context);
  const tracePath = path.join(trace, "docs/eval/page-ir-safe-pipeline/traceability.md");
  const traceText = await fs.readFile(tracePath, "utf8");
  await fs.writeFile(tracePath, traceText.replace("EVAL-SEC-003", "EVAL-SEC-002"));
  await assert.rejects(validatePageIrHarnessContract(trace), /traceability/i);

  const missingTest = await copyContractRoot(context);
  await fs.rm(path.join(missingTest, "src/lib/pageIrCompiler.test.ts"));
  await assert.rejects(validatePageIrHarnessContract(missingTest), /registered test.*unreadable/i);
});

test("rejects a registry that does not route every frozen blocking evaluation", async (context) => {
  const root = await copyContractRoot(context);
  const registryPath = path.join(root, "docs/eval/page-ir-safe-pipeline/harness-registry.json");
  const registry = await json(registryPath);
  delete registry.evaluations["EVAL-IR-001"];
  await writeJson(registryPath, registry);
  await refreshLock(root, "harness-registry.lock.json", "harness-registry.json", "registryVersion");
  await assert.rejects(
    validatePageIrHarnessContract(root),
    /registry evaluations.*frozen contract/i,
  );
});

test("rejects unit-test substitutions for rendered, human, and qualification coordinator evidence", async (context) => {
  for (const [evaluationId, replacement, expected] of [
    ["EVAL-UX-001", {
      kind: "credential-free-tests",
      testFiles: ["src/components/IntakeComposer.test.tsx"],
      credentialPolicy: "absent",
      networkPolicy: "deny-all",
    }, /rendered.*coordinator|coordinator.*rendered/i],
    ["EVAL-QUAL-001", {
      kind: "coordinator-evidence",
      evaluator: "rendered-evidence",
    }, /human.*qualification|qualification.*human/i],
    ["EVAL-OPS-004", {
      kind: "coordinator-evidence",
      evaluator: "qualification-human-review",
    }, /OPS-004.*qualification contract|qualification contract.*OPS-004/i],
  ]) {
    const root = await copyContractRoot(context);
    const registryPath = path.join(root, "docs/eval/page-ir-safe-pipeline/harness-registry.json");
    const registry = await json(registryPath);
    registry.evaluations[evaluationId] = replacement;
    await writeJson(registryPath, registry);
    await refreshLock(root, "harness-registry.lock.json", "harness-registry.json", "registryVersion");
    await assert.rejects(validatePageIrHarnessContract(root), expected);
  }
});

test("rejects checked-in fixture drift even when the registry lock is refreshed", async (context) => {
  const root = await copyContractRoot(context);
  const fixturePath = path.join(
    root,
    "docs/eval/page-ir-safe-pipeline/fixtures/brochure-local-service/fixture.json",
  );
  const fixture = await json(fixturePath);
  fixture.providerMode = "live";
  await writeJson(fixturePath, fixture);
  await refreshLock(
    root,
    "harness-registry.lock.json",
    "harness-registry.json",
    "registryVersion",
  );
  await assert.rejects(
    validatePageIrHarnessContract(root),
    /frozen fixture manifest hash mismatch/i,
  );
});

test("rejects a missing PRD authority referenced by the ticket manifest", async (context) => {
  const root = await copyContractRoot(context);
  await fs.rm(
    path.join(root, "docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md"),
  );
  await assert.rejects(
    validatePageIrHarnessContract(root),
    /product requirements.*unreadable/i,
  );
});

test("rejects owner drift and owners that are not dependency-last", async (context) => {
  const ownerRoot = await copyContractRoot(context);
  const manifestPath = path.join(ownerRoot, "docs/eval/page-ir-safe-pipeline/manifest.json");
  const manifest = await json(manifestPath);
  manifest.evaluationOwners["EVAL-WEB-001"] = "OBX-022";
  await writeJson(manifestPath, manifest);
  await refreshLock(ownerRoot, "manifest.lock.json", "manifest.json", "contractVersion");
  await assert.rejects(validatePageIrHarnessContract(ownerRoot), /dependency-last/i);

  const cycleRoot = await copyContractRoot(context);
  const ticketManifestPath = path.join(
    cycleRoot,
    "docs/tickets/page-ir-safe-pipeline/manifest.json",
  );
  const ticketManifest = await json(ticketManifestPath);
  ticketManifest.tickets.find((ticket) => ticket.id === "OBX-001").dependsOn = [
    "OBX-042",
  ];
  await writeJson(ticketManifestPath, ticketManifest);
  const ticketPath = path.join(
    cycleRoot,
    "docs/tickets/page-ir-safe-pipeline/OBX-001-website-only-production.md",
  );
  const ticket = await fs.readFile(ticketPath, "utf8");
  await fs.writeFile(ticketPath, ticket.replace("depends_on: []", "depends_on: [OBX-042]"));
  await assert.rejects(
    validatePageIrHarnessContract(cycleRoot),
    /ticket dependency cycle/i,
  );
});

test("future manifest locks are version-addressed, immutable, and reject reused versions", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-future-lock-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, "manifest.json");
  const lockDirectory = path.join(root, "locks");
  const manifest = await json(
    path.join(REPOSITORY_ROOT, "docs/eval/page-ir-safe-pipeline/manifest.json"),
  );
  manifest.contractVersion = "2.0.0";
  await writeJson(manifestPath, manifest);
  await fs.mkdir(lockDirectory);

  const created = await createVersionedManifestLock({
    repositoryRoot: root,
    manifestPath: "manifest.json",
    lockDirectory: "locks",
  });
  assert.equal(created.lockPath, "locks/manifest-2.0.0.lock.json");
  const lock = await json(path.join(root, created.lockPath));
  assert.equal(lock.contractVersion, "2.0.0");
  assert.equal(lock.sha256, sha256(await fs.readFile(manifestPath)));
  await assert.rejects(
    createVersionedManifestLock({
      repositoryRoot: root,
      manifestPath: "manifest.json",
      lockDirectory: "locks",
    }),
    /version 2\.0\.0 already has a lock/i,
  );

  manifest.contractVersion = "3.0.0";
  await writeJson(manifestPath, manifest);
  await writeJson(path.join(lockDirectory, "legacy-name.lock.json"), {
    schemaVersion: 1,
    contractVersion: "3.0.0",
    manifestPath: "manifest.json",
    sha256: sha256(await fs.readFile(manifestPath)),
  });
  await assert.rejects(
    createVersionedManifestLock({
      repositoryRoot: root,
      manifestPath: "manifest.json",
      lockDirectory: "locks",
    }),
    /version 3\.0\.0 already has a lock/i,
  );

  await fs.rm(path.join(lockDirectory, "legacy-name.lock.json"));
  manifest.contractVersion = "4.0.0";
  await writeJson(manifestPath, manifest);
  await fs.symlink(manifestPath, path.join(lockDirectory, "unsafe.lock.json"));
  await assert.rejects(
    createVersionedManifestLock({
      repositoryRoot: root,
      manifestPath: "manifest.json",
      lockDirectory: "locks",
    }),
    /lock directory contains an unsafe entry/i,
  );
});

test("future manifest lock publication never leaves a partial final lock", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-future-lock-failure-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, "manifest.json");
  const lockDirectory = path.join(root, "locks");
  const finalLock = path.join(lockDirectory, "manifest-5.0.0.lock.json");
  const manifest = await json(
    path.join(REPOSITORY_ROOT, "docs/eval/page-ir-safe-pipeline/manifest.json"),
  );
  manifest.contractVersion = "5.0.0";
  await writeJson(manifestPath, manifest);
  await fs.mkdir(lockDirectory);

  const originalOpen = fs.open;
  let failed = false;
  fs.open = async (file, flags, ...args) => {
    const handle = await originalOpen.call(fs, file, flags, ...args);
    if (!failed && flags === "wx" && path.dirname(path.resolve(String(file))) === lockDirectory) {
      failed = true;
      const originalWriteFile = handle.writeFile.bind(handle);
      handle.writeFile = async (bytes, ...writeArgs) => {
        await originalWriteFile(bytes.subarray(0, Math.max(1, bytes.length / 2)), ...writeArgs);
        throw new Error("simulated lock write failure");
      };
    }
    return handle;
  };
  try {
    await assert.rejects(
      createVersionedManifestLock({
        repositoryRoot: root,
        manifestPath: "manifest.json",
        lockDirectory: "locks",
      }),
      /simulated lock write failure/,
    );
  } finally {
    fs.open = originalOpen;
  }

  await assert.rejects(fs.lstat(finalLock), { code: "ENOENT" });
  assert.deepEqual(await fs.readdir(lockDirectory), []);
  const created = await createVersionedManifestLock({
    repositoryRoot: root,
    manifestPath: "manifest.json",
    lockDirectory: "locks",
  });
  assert.equal(created.lockPath, "locks/manifest-5.0.0.lock.json");
});

test("future manifest lock creation recovers a crash between link and temp cleanup", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-future-lock-link-crash-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, "manifest.json");
  const lockDirectory = path.join(root, "locks");
  const finalLock = path.join(lockDirectory, "manifest-6.0.0.lock.json");
  const manifest = await json(
    path.join(REPOSITORY_ROOT, "docs/eval/page-ir-safe-pipeline/manifest.json"),
  );
  manifest.contractVersion = "6.0.0";
  await writeJson(manifestPath, manifest);
  await fs.mkdir(lockDirectory);

  const originalUnlink = fs.unlink;
  fs.unlink = async (file) => {
    if (path.basename(String(file)).endsWith(".tmp")) {
      throw new Error("simulated crash before temp unlink");
    }
    return originalUnlink.call(fs, file);
  };
  try {
    await assert.rejects(
      createVersionedManifestLock({
        repositoryRoot: root,
        manifestPath: "manifest.json",
        lockDirectory: "locks",
      }),
      /simulated crash before temp unlink/,
    );
  } finally {
    fs.unlink = originalUnlink;
  }

  const crashedEntries = await fs.readdir(lockDirectory);
  assert.equal(crashedEntries.length, 2);
  assert.equal((await fs.lstat(finalLock)).nlink, 2);
  await assert.rejects(
    createVersionedManifestLock({
      repositoryRoot: root,
      manifestPath: "manifest.json",
      lockDirectory: "locks",
    }),
    /version 6\.0\.0 already has a lock/i,
  );
  assert.deepEqual(await fs.readdir(lockDirectory), ["manifest-6.0.0.lock.json"]);
  assert.equal((await fs.lstat(finalLock)).nlink, 1);
  assert.equal((await json(finalLock)).contractVersion, "6.0.0");
});
