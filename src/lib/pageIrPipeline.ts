import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CandidateProvenanceV1Schema,
  CandidateRelativePathSchema,
  MAX_PAGE_IR_ARTIFACT_BYTES,
  PAGE_IR_BOUNDS,
  PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS,
  PAGE_IR_SOURCE_BUNDLE_REVIEW_TRANSITIONS,
  PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS,
  PageIrArtifactBindingV1Schema,
  PageIrAssetMediaTypeV1Schema,
  PageIrAssetsV1Schema,
  PageIrContentV1Schema,
  PageIrLayoutDecisionV1Schema,
  PageIrSourceBundleReviewCriteriaV1Schema,
  PageIrSourceBundleReviewStateV1Schema,
  PageIrSourceBundleV1Schema,
  PersistedPageIrV1Schema,
  RunIdSchema,
  workflowArtifactApprovalState,
  type PageIrArtifactBindingV1,
  type CandidateManifestV1,
  type CandidateProvenanceV1,
  type PageIrSourceBundleReviewStateV1,
  type PageIrSourceBundleV1,
  type PersistedPageIrV1,
  type RunState,
  type WorkflowArtifactType,
  type WorkflowArtifactVersion,
} from "./contracts";
import {
  assertRunLayoutAuthority,
  loadRun,
  pageIrPaths,
  sitePaths,
  withRunTransaction,
  workflowArtifactVersionPath,
} from "./runstate";
import {
  candidateManifestSha256,
  inspectCandidate,
  transitionCandidateProvenance,
  validateCandidateInputArtifactHashes,
  validateCandidateInventory,
} from "./candidate";
import { derivePageIRV1 } from "./pageIrDerivation";
import { pageIrSha256 } from "./pageIrHash";
import { PAGE_IR_COMPILER_VERSION, compilePageIRV1 } from "./pageIrCompiler";
import { withSiteAuthorityLock } from "./siteAuthority";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW | NONBLOCK;
const SOURCE_FILE_BY_KIND = {
  "layout-decision": "layout-decision.json",
  content: "content.json",
  assets: "assets.json",
} as const;
const WORKFLOW_TYPE_BY_KIND = {
  evidence: "ledger",
  "design-contract": "design-contract",
  "token-inventory": "token-inventory",
  "tailwind-plan": "tailwind-plan",
  "css-architecture": "css-architecture",
} as const satisfies Record<
  (typeof PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS)[number],
  WorkflowArtifactType
>;

const ProposalSourceSchema = z
  .object({
    kind: z.enum(PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS),
    version: z.number().int().positive().max(1_000_000),
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.byteLength <= MAX_PAGE_IR_ARTIFACT_BYTES, {
        message: "source artifact bytes exceed the supported maximum",
      }),
  })
  .strict();

const PageIrSourceBundleProposalV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    bundleVersion: z.literal(1),
    sources: z
      .array(ProposalSourceSchema)
      .length(PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS.length),
  })
  .strict()
  .superRefine((proposal, context) => {
    for (const [
      index,
      kind,
    ] of PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS.entries()) {
      if (proposal.sources[index]?.kind !== kind) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "kind"],
          message: "source proposal must use the fixed artifact order",
        });
      }
    }
  });

const ReviewTransitionOptionsSchema = z
  .object({
    actorKind: z.enum(["human", "system", "model"]),
    actorName: z.string().trim().min(1).max(120),
    note: z.string().trim().min(1).max(2_000).optional(),
    humanAttestation: z.literal(true).optional(),
    criteria: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const PageIrCandidateAssetSourceV1Schema = z
  .object({
    assetId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    artifactPath: CandidateRelativePathSchema.refine(
      (value) => value.startsWith("uploads/"),
      "Page IR compiler assets must use the closed run-owned uploads seam",
    ),
    mediaType: PageIrAssetMediaTypeV1Schema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const PageIrCandidateMaterializationRequestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    assets: z
      .array(PageIrCandidateAssetSourceV1Schema)
      .max(PAGE_IR_BOUNDS.maxAssets),
  })
  .strict()
  .superRefine((request, context) => {
    const assetIds = request.assets.map((asset) => asset.assetId);
    const paths = request.assets.map((asset) => asset.artifactPath);
    if (new Set(assetIds).size !== assetIds.length) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Page IR compiler asset IDs must be unique",
      });
    }
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Page IR compiler asset paths must be unique",
      });
    }
  });

type SourceProposal = z.infer<typeof PageIrSourceBundleProposalV1Schema>;
type UpstreamKind = (typeof PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS)[number];
type UpstreamArtifactBinding = Omit<PageIrArtifactBindingV1, "kind"> & {
  kind: UpstreamKind;
};

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function immutableBundlePayload(
  bundle: Omit<PageIrSourceBundleV1, "payloadSha256" | "reviewTransitions">,
) {
  return {
    schemaVersion: bundle.schemaVersion,
    runId: bundle.runId,
    bundleVersion: bundle.bundleVersion,
    upstreamBindings: bundle.upstreamBindings,
    sourceArtifacts: bundle.sourceArtifacts,
  };
}

function sourceBundlePayloadSha256(
  bundle: Omit<PageIrSourceBundleV1, "payloadSha256" | "reviewTransitions">,
): string {
  return sha256(JSON.stringify(canonicalize(immutableBundlePayload(bundle))));
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function lstatMaybe(filePath: string) {
  try {
    return await fs.lstat(filePath, { bigint: true });
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

async function readRegularFile(
  filePath: string,
  label: string,
  maxBytes = MAX_PAGE_IR_ARTIFACT_BYTES,
): Promise<Buffer> {
  const initial = await fs.lstat(filePath, { bigint: true });
  if (
    initial.isSymbolicLink() ||
    !initial.isFile() ||
    initial.nlink > BigInt(1)
  ) {
    throw new Error(`${label} must be one regular non-linked file`);
  }
  if (initial.size > BigInt(maxBytes)) {
    throw new Error(`${label} exceeds the supported maximum`);
  }
  const handle = await fs.open(filePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.size !== initial.size
    ) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size
    ) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function latestApprovedArtifact(
  state: RunState,
  artifactType: WorkflowArtifactType,
): WorkflowArtifactVersion {
  const artifact = state.evidenceWorkflow.artifacts
    .filter((candidate) => candidate.artifactType === artifactType)
    .sort((left, right) => right.version - left.version)[0];
  if (!artifact || workflowArtifactApprovalState(artifact) !== "approved") {
    throw new Error(
      `Page IR source bundle requires the current approved ${artifactType}`,
    );
  }
  return artifact;
}

async function currentUpstreamArtifactBindings(
  state: RunState,
): Promise<UpstreamArtifactBinding[]> {
  if (
    state.pipelineVersion !== "evidence-gated-v2" ||
    state.evidenceWorkflow.currentStage !== "build"
  ) {
    throw new Error(
      "Page IR source bundle requires completed CSS approval at the build boundary",
    );
  }
  const runRoot = sitePaths(state.id).root;
  return Promise.all(
    PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS.map(async (kind) => {
      const artifact = latestApprovedArtifact(
        state,
        WORKFLOW_TYPE_BY_KIND[kind],
      );
      const relativePath = workflowArtifactVersionPath(
        artifact.artifactType,
        artifact.version,
      );
      const bytes = await readRegularFile(
        path.join(runRoot, ...relativePath.split("/")),
        `approved Page IR upstream ${kind}`,
      );
      const parsed = PageIrArtifactBindingV1Schema.parse({
        kind,
        runId: state.id,
        version: artifact.version,
        approvalState: "approved",
        sha256: sha256(bytes),
        bytes,
      });
      return { ...parsed, kind };
    }),
  );
}

async function currentUpstreamBindings(state: RunState) {
  return (await currentUpstreamArtifactBindings(state)).map(
    ({ kind, version, sha256: bindingSha256 }) => ({
      kind,
      version,
      sha256: bindingSha256,
    }),
  );
}

function parseProposalSources(proposal: SourceProposal) {
  const layoutBinding = proposal.sources[0];
  const contentBinding = proposal.sources[1];
  const assetsBinding = proposal.sources[2];
  if (
    layoutBinding.kind !== "layout-decision" ||
    contentBinding.kind !== "content" ||
    assetsBinding.kind !== "assets"
  ) {
    throw new Error("Page IR source proposal is not in the fixed order");
  }
  const layout = PageIrLayoutDecisionV1Schema.parse(
    JSON.parse(Buffer.from(layoutBinding.bytes).toString("utf8")),
  );
  const content = PageIrContentV1Schema.parse(
    JSON.parse(Buffer.from(contentBinding.bytes).toString("utf8")),
  );
  const assets = PageIrAssetsV1Schema.parse(
    JSON.parse(Buffer.from(assetsBinding.bytes).toString("utf8")),
  );
  return {
    layoutBinding,
    contentBinding,
    assetsBinding,
    layout,
    content,
    assets,
  };
}

function sourceArtifacts(proposal: SourceProposal) {
  const parsed = parseProposalSources(proposal);
  return [
    {
      kind: "layout-decision" as const,
      version: parsed.layoutBinding.version,
      sha256: sha256(parsed.layoutBinding.bytes),
      sourceVersions: parsed.layout.sourceVersions,
    },
    {
      kind: "content" as const,
      version: parsed.contentBinding.version,
      sha256: sha256(parsed.contentBinding.bytes),
      sourceLayoutDecisionVersion: parsed.content.sourceLayoutDecisionVersion,
    },
    {
      kind: "assets" as const,
      version: parsed.assetsBinding.version,
      sha256: sha256(parsed.assetsBinding.bytes),
      sourceLayoutDecisionVersion: parsed.assets.sourceLayoutDecisionVersion,
    },
  ];
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeExclusive(
  filePath: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const handle = await fs.open(filePath, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertClosedSourceRoot(sourceRoot: string): Promise<void> {
  const root = await fs.lstat(sourceRoot, { bigint: true });
  if (root.isSymbolicLink() || !root.isDirectory()) {
    throw new Error("Page IR source root must be one real directory");
  }
  const expected = [
    "assets.json",
    "bundle.json",
    "content.json",
    "layout-decision.json",
  ];
  const entries = (await fs.readdir(sourceRoot)).sort();
  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw new Error("Page IR source root contains an unknown or missing file");
  }
}

async function loadSourceBundleUnderState(
  state: RunState,
  requireApproved: boolean,
): Promise<{
  bundle: PageIrSourceBundleV1;
  sourceBytes: Record<
    (typeof PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS)[number],
    Buffer
  >;
}> {
  assertRunLayoutAuthority(state, "page-ir-v1", "Page IR source bundle");
  const paths = pageIrPaths(state.id);
  await assertClosedSourceRoot(paths.sourceRoot);
  const [bundleBytes, layoutDecision, content, assets] = await Promise.all([
    readRegularFile(paths.sourceBundle, "Page IR source bundle metadata"),
    readRegularFile(paths.layoutDecision, "Page IR layout decision"),
    readRegularFile(paths.content, "Page IR content"),
    readRegularFile(paths.assets, "Page IR assets"),
  ]);
  const bundle = PageIrSourceBundleV1Schema.parse(
    JSON.parse(bundleBytes.toString("utf8")),
  );
  if (bundle.runId !== state.id || bundle.bundleVersion !== 1) {
    throw new Error("Page IR source bundle does not match its current run");
  }
  const payload = immutableBundlePayload(bundle);
  if (sourceBundlePayloadSha256(payload) !== bundle.payloadSha256) {
    throw new Error("Page IR source bundle payload SHA-256 mismatch");
  }
  const sourceBytes = { "layout-decision": layoutDecision, content, assets };
  for (const artifact of bundle.sourceArtifacts) {
    if (sha256(sourceBytes[artifact.kind]) !== artifact.sha256) {
      throw new Error(`Page IR source ${artifact.kind} SHA-256 mismatch`);
    }
  }
  const currentUpstream = await currentUpstreamBindings(state);
  if (
    JSON.stringify(currentUpstream) !== JSON.stringify(bundle.upstreamBindings)
  ) {
    throw new Error("Page IR source bundle upstream approval binding is stale");
  }
  parseProposalSources({
    schemaVersion: 1,
    runId: state.id,
    bundleVersion: 1,
    sources: bundle.sourceArtifacts.map((artifact) => ({
      kind: artifact.kind,
      version: artifact.version,
      bytes: Uint8Array.from(sourceBytes[artifact.kind]),
    })),
  });
  const stateName = bundle.reviewTransitions.at(-1)?.state;
  if (requireApproved && stateName !== "approved") {
    throw new Error(
      `Page IR source bundle is ${stateName ?? "unreviewed"}, not approved`,
    );
  }
  return { bundle, sourceBytes };
}

export async function proposePageIrSourceBundle(
  input: unknown,
): Promise<PageIrSourceBundleV1> {
  const proposal = PageIrSourceBundleProposalV1Schema.parse(input);
  return withRunTransaction(proposal.runId, async (transaction) => {
    assertRunLayoutAuthority(
      transaction.state,
      "page-ir-v1",
      "Page IR source proposal",
    );
    const upstreamBindings = await currentUpstreamBindings(transaction.state);
    const immutable = {
      schemaVersion: 1 as const,
      runId: proposal.runId,
      bundleVersion: proposal.bundleVersion,
      upstreamBindings,
      sourceArtifacts: sourceArtifacts(proposal),
    };
    const payloadSha256 = sourceBundlePayloadSha256(immutable);
    const existing = await lstatMaybe(pageIrPaths(proposal.runId).sourceRoot);
    if (existing) {
      const loaded = await loadSourceBundleUnderState(transaction.state, false);
      if (
        loaded.bundle.payloadSha256 !== payloadSha256 ||
        proposal.sources.some(
          (source) =>
            !Buffer.from(loaded.sourceBytes[source.kind]).equals(
              Buffer.from(source.bytes),
            ),
        )
      ) {
        throw new Error(
          "Page IR source bundle payload is immutable and conflicts with the proposal",
        );
      }
      return loaded.bundle;
    }

    const now = new Date().toISOString();
    const bundle = PageIrSourceBundleV1Schema.parse({
      ...immutable,
      payloadSha256,
      reviewTransitions: [
        {
          state: "draft",
          at: now,
          actorKind: "system",
          actorName: "page-ir-source-bundle",
        },
      ],
    });
    const paths = pageIrPaths(proposal.runId);
    const sourceParent = path.dirname(paths.sourceRoot);
    await fs.mkdir(sourceParent, { recursive: true });
    const parentStat = await fs.lstat(sourceParent, { bigint: true });
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
      throw new Error("Page IR source parent must be one real directory");
    }
    const staging = path.join(
      sourceParent,
      `.v1.staging-${process.pid}-${randomBytes(6).toString("hex")}`,
    );
    await fs.mkdir(staging);
    try {
      for (const source of proposal.sources) {
        await writeExclusive(
          path.join(staging, SOURCE_FILE_BY_KIND[source.kind]),
          source.bytes,
        );
      }
      await writeExclusive(
        path.join(staging, "bundle.json"),
        `${JSON.stringify(bundle, null, 2)}\n`,
      );
      await syncDirectory(staging);
      await fs.rename(staging, paths.sourceRoot);
      await syncDirectory(sourceParent);
      return bundle;
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  });
}

export async function transitionPageIrSourceBundleReview(
  runId: string,
  nextState: PageIrSourceBundleReviewStateV1,
  input: unknown,
): Promise<PageIrSourceBundleV1> {
  const parsedRunId = RunIdSchema.parse(runId);
  const stateName = PageIrSourceBundleReviewStateV1Schema.parse(nextState);
  const options = ReviewTransitionOptionsSchema.parse(input);
  return withRunTransaction(parsedRunId, async (transaction) => {
    const { bundle } = await loadSourceBundleUnderState(
      transaction.state,
      false,
    );
    const current = bundle.reviewTransitions.at(-1)!;
    const allowed = PAGE_IR_SOURCE_BUNDLE_REVIEW_TRANSITIONS[
      current.state
    ] as readonly PageIrSourceBundleReviewStateV1[];
    if (!allowed.includes(stateName)) {
      throw new Error(
        `invalid source bundle review transition: ${current.state} -> ${stateName}`,
      );
    }
    if (stateName === "in-review" && options.actorKind !== "human") {
      throw new Error("Page IR source bundle review requires a named human");
    }

    const at = new Date().toISOString();
    let humanReview;
    if (stateName === "approved") {
      if (options.actorKind !== "human" || options.humanAttestation !== true) {
        throw new Error(
          "Page IR source bundle approval requires explicit named-human attestation",
        );
      }
      const criteria = PageIrSourceBundleReviewCriteriaV1Schema.safeParse(
        options.criteria,
      );
      if (!criteria.success) {
        throw new Error(
          "Page IR source bundle approval requires explicit all-pass criteria",
        );
      }
      humanReview = {
        reviewerName: options.actorName,
        reviewerKind: "human" as const,
        humanAttestation: true as const,
        reviewedAt: at,
        payloadSha256: bundle.payloadSha256,
        criteria: criteria.data,
      };
    }
    const updated = PageIrSourceBundleV1Schema.parse({
      ...bundle,
      reviewTransitions: [
        ...bundle.reviewTransitions,
        {
          state: stateName,
          at,
          actorKind: options.actorKind,
          actorName: options.actorName,
          note: options.note,
          humanReview,
        },
      ],
    });
    if (updated.payloadSha256 !== bundle.payloadSha256) {
      throw new Error("Page IR source bundle payload is immutable");
    }
    await transaction.writeArtifact(
      "page-ir-sources/v1/bundle.json",
      `${JSON.stringify(updated, null, 2)}\n`,
    );
    return updated;
  });
}

export async function loadApprovedPageIrSourceBundle(runId: string) {
  const parsedRunId = RunIdSchema.parse(runId);
  return loadSourceBundleUnderState(await loadRun(parsedRunId), true);
}

async function approvedDerivationBindingsUnderState(
  state: RunState,
): Promise<PageIrArtifactBindingV1[]> {
  const upstream = await currentUpstreamArtifactBindings(state);
  const { bundle, sourceBytes } = await loadSourceBundleUnderState(state, true);
  const sources = bundle.sourceArtifacts.map((artifact) =>
    PageIrArtifactBindingV1Schema.parse({
      kind: artifact.kind,
      runId: state.id,
      version: artifact.version,
      approvalState: "approved",
      sha256: artifact.sha256,
      bytes: sourceBytes[artifact.kind],
    }),
  );
  return [...upstream, ...sources];
}

function bindingSetSha256(
  runId: string,
  bindings: ReadonlyArray<
    Pick<PageIrArtifactBindingV1, "kind" | "version" | "sha256">
  >,
): string {
  return sha256(
    JSON.stringify(
      canonicalize({
        schemaVersion: 1,
        runId,
        sources: bindings.map(({ kind, version, sha256: bindingSha256 }) => ({
          kind,
          version,
          sha256: bindingSha256,
        })),
      }),
    ),
  );
}

async function loadPersistedPageIrUnderState(
  state: RunState,
): Promise<PersistedPageIrV1> {
  assertRunLayoutAuthority(state, "page-ir-v1", "persisted Page IR");
  const bytes = await readRegularFile(
    pageIrPaths(state.id).pageIr,
    "persisted Page IR",
  );
  const envelope = PersistedPageIrV1Schema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (envelope.runId !== state.id) {
    throw new Error("persisted Page IR does not match its current run");
  }
  if (pageIrSha256(envelope.pageIr) !== envelope.pageIrSha256) {
    throw new Error("persisted Page IR SHA-256 mismatch");
  }
  if (
    bindingSetSha256(envelope.runId, envelope.lineage.sources) !==
    envelope.bindingSetSha256
  ) {
    throw new Error("persisted Page IR binding-set SHA-256 mismatch");
  }
  return envelope;
}

export interface PersistInitialPageIrHooks {
  beforePageIrRename?: () => void | Promise<void>;
  afterPageIrRename?: () => void | Promise<void>;
}

export async function deriveAndPersistInitialPageIr(
  runId: string,
  hooks: PersistInitialPageIrHooks = {},
): Promise<PersistedPageIrV1> {
  const parsedRunId = RunIdSchema.parse(runId);
  return withRunTransaction(parsedRunId, async (transaction) => {
    assertRunLayoutAuthority(
      transaction.state,
      "page-ir-v1",
      "initial Page IR derivation",
    );
    const pageIrPath = pageIrPaths(parsedRunId).pageIr;
    if (await lstatMaybe(pageIrPath)) {
      const existing = await loadPersistedPageIrUnderState(transaction.state);
      const currentBindings = await approvedDerivationBindingsUnderState(
        transaction.state,
      );
      if (
        bindingSetSha256(parsedRunId, currentBindings) !==
        existing.bindingSetSha256
      ) {
        throw new Error(
          "persisted Page IR conflicts with the current derivation bindings and cannot be overwritten",
        );
      }
      return existing;
    }

    const bindings = await approvedDerivationBindingsUnderState(
      transaction.state,
    );
    const derived = derivePageIRV1({
      schemaVersion: 1,
      runId: parsedRunId,
      bindings,
    });
    const envelope = PersistedPageIrV1Schema.parse({
      schemaVersion: 1,
      runId: parsedRunId,
      revision: 1,
      pageIr: derived.pageIr,
      pageIrSha256: derived.pageIrSha256,
      bindingSetSha256: bindingSetSha256(parsedRunId, bindings),
      lineage: derived.lineage,
    });
    const bytes = `${JSON.stringify(envelope, null, 2)}\n`;
    const temporary = path.join(
      path.dirname(pageIrPath),
      `.${path.basename(pageIrPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    try {
      await writeExclusive(temporary, bytes);
      await hooks.beforePageIrRename?.();
      await fs.rename(temporary, pageIrPath);
      await syncDirectory(path.dirname(pageIrPath));
      await hooks.afterPageIrRename?.();
      return envelope;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  });
}

export async function loadPersistedPageIr(
  runId: string,
): Promise<PersistedPageIrV1> {
  const parsedRunId = RunIdSchema.parse(runId);
  return loadPersistedPageIrUnderState(await loadRun(parsedRunId));
}

export interface MaterializePageIrCandidateHooks {
  beforeCandidateRename?: () => void | Promise<void>;
  afterCandidateRetire?: () => void | Promise<void>;
  afterCandidateRename?: () => void | Promise<void>;
}

export interface MaterializePageIrCandidateResult {
  status: "created" | "reused" | "parked-failed";
  manifest: CandidateManifestV1;
  provenance: CandidateProvenanceV1;
}

function sameInputHashes(
  left: CandidateProvenanceV1["inputArtifactHashes"],
  right: CandidateProvenanceV1["inputArtifactHashes"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function installCandidateDirectory(
  staging: string,
  target: string,
  hooks: MaterializePageIrCandidateHooks,
): Promise<void> {
  const token = `${process.pid}-${randomBytes(6).toString("hex")}`;
  const retired = `${target}.retired-${token}`;
  const parent = path.dirname(target);
  const hadPrevious = Boolean(await lstatMaybe(target));
  let committed = false;
  let installed = false;
  let retiredPrevious = false;
  await hooks.beforeCandidateRename?.();
  try {
    if (hadPrevious) {
      await fs.rename(target, retired);
      retiredPrevious = true;
      await syncDirectory(parent);
      await hooks.afterCandidateRetire?.();
    }
    await fs.rename(staging, target);
    installed = true;
    await syncDirectory(parent);
    committed = true;
    await hooks.afterCandidateRename?.();
    if (retiredPrevious) {
      await fs.rm(retired, { recursive: true, force: true });
      retiredPrevious = false;
      await syncDirectory(parent);
    }
  } catch (error) {
    if (!committed) {
      try {
        if (installed) {
          await fs.rename(target, staging);
          installed = false;
        }
        if (retiredPrevious) {
          await fs.rename(retired, target);
          retiredPrevious = false;
        }
        await syncDirectory(parent);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "candidate swap failed and the prior candidate could not be restored",
        );
      }
    } else if (retiredPrevious) {
      try {
        await fs.rm(retired, { recursive: true, force: true });
        retiredPrevious = false;
        await syncDirectory(parent);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "candidate publish completed but retired-candidate cleanup failed",
        );
      }
    }
    throw error;
  }
}

export async function materializePageIrCandidate(
  input: unknown,
  hooks: MaterializePageIrCandidateHooks = {},
): Promise<MaterializePageIrCandidateResult> {
  const request = PageIrCandidateMaterializationRequestV1Schema.parse(input);
  return withSiteAuthorityLock(request.runId, async () => {
    const run = await loadRun(request.runId);
    assertRunLayoutAuthority(
      run,
      "page-ir-v1",
      "Page IR candidate materialization",
    );
    const persisted = await loadPersistedPageIrUnderState(run);
    const runRoot = sitePaths(request.runId).root;
    const pageIrBytes = await readRegularFile(
      pageIrPaths(request.runId).pageIr,
      "Page IR candidate input",
    );
    const compilerAssets = await Promise.all(
      request.assets.map(async (asset) => {
        const bytes = await readRegularFile(
          path.join(runRoot, ...asset.artifactPath.split("/")),
          `Page IR compiler asset ${asset.assetId}`,
          PAGE_IR_BOUNDS.maxAssetBytes,
        );
        if (sha256(bytes) !== asset.sha256) {
          throw new Error(
            `Page IR compiler asset ${asset.assetId} SHA-256 mismatch`,
          );
        }
        return {
          assetId: asset.assetId,
          mediaType: asset.mediaType,
          sha256: asset.sha256,
          bytes,
        };
      }),
    );
    const compilation = compilePageIRV1({
      schemaVersion: 1,
      pageIr: persisted.pageIr,
      assets: compilerAssets,
    });
    const inputArtifactHashes = [
      { path: "page-ir.json", sha256: sha256(pageIrBytes) },
      ...request.assets.map((asset) => ({
        path: asset.artifactPath,
        sha256: asset.sha256,
      })),
    ].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    const manifestSha256 = candidateManifestSha256(compilation.manifest);
    const current = await inspectCandidate(request.runId);
    const matchesCurrentCompilation = Boolean(
      current.status === "present" &&
      current.manifest &&
      ["ready-for-gates", "promotable", "promoted", "failed"].includes(
        current.provenance.state,
      ) &&
      current.provenance.layoutAuthority === "page-ir-v1" &&
      current.provenance.compilerVersion === PAGE_IR_COMPILER_VERSION &&
      current.provenance.pageIrSha256 === persisted.pageIrSha256 &&
      sameInputHashes(
        current.provenance.inputArtifactHashes,
        inputArtifactHashes,
      ) &&
      current.provenance.candidateManifestSha256 === manifestSha256 &&
      current.provenance.buildSha256 === compilation.manifest.buildSha256 &&
      JSON.stringify(current.manifest) === JSON.stringify(compilation.manifest),
    );
    if (
      matchesCurrentCompilation &&
      current.status === "present" &&
      current.manifest
    ) {
      await validateCandidateInputArtifactHashes(
        request.runId,
        inputArtifactHashes,
      );
      return {
        status:
          current.provenance.state === "failed" ? "parked-failed" : "reused",
        manifest: current.manifest,
        provenance: current.provenance,
      };
    }
    if (
      current.status === "present" &&
      ["failed", "promotable", "promoted"].includes(current.provenance.state)
    ) {
      throw new Error(
        `Page IR ${current.provenance.state} candidate is parked and cannot be replaced by materialization`,
      );
    }

    const candidateRoot = path.join(runRoot, "candidate");
    const staging = `${candidateRoot}.building-${process.pid}-${randomBytes(6).toString("hex")}`;
    const stagingSite = path.join(staging, "site");
    await fs.mkdir(stagingSite, { recursive: true });
    let committed = false;
    try {
      const outputDirectories = new Set([stagingSite]);
      for (const file of compilation.files) {
        const output = path.join(stagingSite, ...file.path.split("/"));
        await fs.mkdir(path.dirname(output), { recursive: true });
        outputDirectories.add(path.dirname(output));
        await writeExclusive(output, file.bytes);
      }
      for (const directory of [...outputDirectories].sort(
        (left, right) => right.length - left.length,
      )) {
        await syncDirectory(directory);
      }
      await validateCandidateInventory(stagingSite, compilation.manifest);
      const createdAt = new Date().toISOString();
      const preparing = CandidateProvenanceV1Schema.parse({
        schemaVersion: 1,
        candidateId: "candidate-v1",
        runId: request.runId,
        createdAt,
        state: "preparing",
        history: [{ state: "preparing", at: createdAt }],
        inputArtifactHashes,
        layoutAuthority: "page-ir-v1",
        compilerVersion: PAGE_IR_COMPILER_VERSION,
        pageIrSha256: persisted.pageIrSha256,
      });
      const ready = transitionCandidateProvenance(
        preparing,
        "ready-for-gates",
        new Date().toISOString(),
        {
          candidateManifestSha256: manifestSha256,
          buildSha256: compilation.manifest.buildSha256,
        },
      );
      await writeExclusive(
        path.join(staging, "manifest.json"),
        compilation.manifestBytes,
      );
      await writeExclusive(
        path.join(staging, "provenance.json"),
        `${JSON.stringify(ready, null, 2)}\n`,
      );
      await syncDirectory(staging);
      await validateCandidateInputArtifactHashes(
        request.runId,
        inputArtifactHashes,
      );
      const currentRun = await loadRun(request.runId);
      assertRunLayoutAuthority(
        currentRun,
        "page-ir-v1",
        "Page IR candidate commit",
      );
      if (
        (await loadPersistedPageIrUnderState(currentRun)).pageIrSha256 !==
        persisted.pageIrSha256
      ) {
        throw new Error("persisted Page IR changed before candidate commit");
      }
      await installCandidateDirectory(staging, candidateRoot, hooks);
      committed = true;
      return {
        status: "created",
        manifest: compilation.manifest,
        provenance: ready,
      };
    } finally {
      if (!committed) await fs.rm(staging, { recursive: true, force: true });
    }
  });
}
