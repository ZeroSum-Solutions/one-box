/**
 * Quality gates for a built site (sites/<runId>/site/). Gates measure the
 * BUILT SITE, not the design contract (audit E24) — everything runs against
 * a real Playwright page load, never a static grep of DESIGN.md.
 *
 * (a) token-drift   BLOCKING — every rendered color/font traces to tokens.css,
 *                    and every custom property the stylesheets reference is
 *                    actually defined (ENG-006)
 * (a2) color-role-compliance BLOCKING — structured token bans are never used
 *                    in their forbidden rendered contexts
 * (b) axe           BLOCKING — zero serious/critical a11y violations
 * (b2) contrast     BLOCKING — WCAG AA over the rendered page at two widths,
 *                    INCLUDING hover states, which axe does not evaluate
 * (c) console-errors BLOCKING — no console errors on load
 * (d) assets        BLOCKING — every img/stylesheet/script resolves, every
 *                    internal #anchor resolves, tel: links match intake phone
 * (e) no-js         BLOCKING — hero/nav/contact CTA visible with JS disabled
 * (f) perf-budget   ADVISORY — transfer size + image bytes + DCL under a
 *                    throttled-CPU load; reports numbers, never blocks
 *
 * Live callers retain their run-ID/options API. Candidate callers use a
 * separate closed target derived from the OBX-010 candidate contract.
 */
import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import {
  SITES_DIR,
  SITE_DIR,
  CANDIDATE_DIR,
  ARTIFACTS,
  CANDIDATE_GATE_EXPECTATIONS,
  DesignTokensSchema,
  FORBIDDEN_CONTEXTS,
  GateReportSchema,
  IntakeSchema,
  CandidateGateReceiptV1Schema,
  PersistedPageIrV1Schema,
  RunIdSchema,
  V2DesignContractMetadataSchema,
  type CandidateGateReceiptV1,
  type CandidateProvenanceV1,
  type DesignTokens,
  type GateReport,
  type MutationGateRequestV1,
  type PageIRV1,
} from "./contracts";
import {
  inspectCandidate,
  validateCandidateInputArtifactHashes,
  validateCandidateInventory,
} from "./candidate";
import { candidatePaths, workflowArtifactVersionPath } from "./runstate";
import { findUnresolvedSheetRefs } from "./cssVars";
import { gateContrast } from "./contrastGate";
import { pageIrSha256 } from "./pageIrHash";
import { selectMutationGateNames } from "./mutationGateMatrix";
import { launchEvaluationAwareBrowser } from "./evaluationBrowser";

export interface RunGatesOptions {
  /** Closed V1 mutation request for after-edit routing. Missing, malformed,
   * mixed, unknown, or future input selects the complete registry. */
  afterEdit?: MutationGateRequestV1;
  /** URL that resolves directly to the built site's index.html. When
   * omitted, gates load the file straight off disk via file://. */
  baseUrl?: string;
}

export interface CandidateGateRunResult {
  receipt: CandidateGateReceiptV1;
  gateReportSha256: string;
}

type CandidateGateBinding = Readonly<{
  layoutAuthority: CandidateProvenanceV1["layoutAuthority"];
  compilerVersion: string;
  pageIrSha256?: string;
  candidateManifestSha256: string;
  buildSha256: string;
  inputArtifactHashes: ReadonlyArray<
    CandidateProvenanceV1["inputArtifactHashes"][number]
  >;
}>;

type GateTarget = Readonly<{
  runRoot: string;
  siteRoot: string;
  reportPath: string;
  navigationUrl: string;
  candidateBinding?: CandidateGateBinding;
}>;

type GateInputSnapshot = Readonly<{
  relativePath: string;
  sha256?: string;
  provenanceRequired?: boolean;
  lineageExpectedSha256?: string;
}>;

type TelephoneOracle =
  | Readonly<{ authority: "template-v1"; phone?: string }>
  | Readonly<{
      authority: "page-ir-v1";
      expectedTargets: readonly string[];
    }>;

type NoJsCheck = readonly [label: string, selector: string];

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW | NONBLOCK;
const MAX_GATE_INPUT_BYTES = 100 * 1024 * 1024;

const PERF_BUDGET = {
  totalBytes: 900 * 1024,
  imageBytes: 500 * 1024,
  domContentLoadedMs: 2000,
  cpuThrottleRate: 4,
};

export type ForbiddenContext = (typeof FORBIDDEN_CONTEXTS)[number];

export interface ColorRoleObservation {
  editId?: string;
  selector: string;
  context: ForbiddenContext;
  colorHex: string;
}

export interface ColorRoleViolation {
  selector: string;
  context: ForbiddenContext;
  colorHex: string;
  tokenName: string;
}

export function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (match) {
    const hex = match[1].toLowerCase();
    return `#${hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex}`;
  }
  // rgb()-valued tokens must not silently escape enforcement (review
  // finding); gradients stay out of scope — no single color to match.
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(?:1|1\.0*))?\s*\)$/i);
  if (!rgb) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  if (channels.some((channel) => channel > 255)) return undefined;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Pure decision core so role enforcement can be tested without Playwright. */
export function evaluateColorRoleCompliance(
  observations: readonly ColorRoleObservation[],
  tokens: DesignTokens
): ColorRoleViolation[] {
  const tokenColors = tokens.colors.flatMap((color) => {
    const value = normalizeHexColor(color.value);
    return value ? [{ ...color, value }] : [];
  });

  return observations.flatMap((observation) => {
    const colorHex = normalizeHexColor(observation.colorHex);
    if (!colorHex) return [];
    const matchingTokens = tokenColors.filter((token) => token.value === colorHex);
    // Computed styles preserve only the rendered color, not which same-valued
    // CSS variable produced it. When one matching token allows this context,
    // attributing the pixel to a different matching token would be a false
    // violation. Block only when every possible source forbids the role.
    if (
      matchingTokens.some(
        (token) => !token.forbiddenContexts.includes(observation.context)
      )
    ) {
      return [];
    }
    return matchingTokens
      .filter((token) => token.forbiddenContexts.includes(observation.context))
      .map((token) => ({
        selector: observation.selector,
        context: observation.context,
        colorHex,
        tokenName: token.name,
      }));
  });
}

export async function runGates(runId: string, opts: RunGatesOptions = {}): Promise<GateReport[]> {
  const target = createLiveGateTarget(runId, opts);
  const { allowed, tokens, telephoneOracle, unresolvedRefs } = await prepareGateInputs(target);

  const gateNames = opts.afterEdit === undefined
    ? FULL_GATE_NAMES
    : selectMutationGateNames(opts.afterEdit);

  const reports = await executeGateSuite(target, gateNames, {
    allowed,
    tokens,
    telephoneOracle,
    unresolvedRefs,
  });

  await fs.mkdir(target.runRoot, { recursive: true });
  await writeGates(target.runRoot, reports);
  return reports;
}

const FULL_GATE_NAMES = CANDIDATE_GATE_EXPECTATIONS.map(
  ({ gate }) => gate,
);

function createLiveGateTarget(
  runId: string,
  opts: RunGatesOptions,
): GateTarget {
  const parsedRunId = RunIdSchema.parse(runId);
  const runRoot = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    SITES_DIR,
    parsedRunId,
  );
  const siteRoot = path.join(/*turbopackIgnore: true*/ runRoot, SITE_DIR);
  return Object.freeze({
    runRoot,
    siteRoot,
    reportPath: path.join(runRoot, ARTIFACTS.gates),
    navigationUrl:
      opts.baseUrl ?? `file://${path.join(siteRoot, "index.html")}`,
  });
}

function assertDirectory(stat: BigIntStats, label: string): void {
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory`);
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertCandidateDirectories(target: {
  runRoot: string;
  candidateRoot: string;
  siteRoot: string;
}): Promise<void> {
  const relativeCandidate = path.relative(target.runRoot, target.candidateRoot);
  if (
    relativeCandidate === "" ||
    relativeCandidate.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidate)
  ) {
    throw new Error("candidate root must be inside its run root");
  }
  assertDirectory(
    await fs.lstat(target.runRoot, { bigint: true }),
    "candidate run root",
  );
  assertDirectory(
    await fs.lstat(target.candidateRoot, { bigint: true }),
    "candidate root",
  );
  assertDirectory(
    await fs.lstat(target.siteRoot, { bigint: true }),
    "candidate site root",
  );
}

function assertClosedCandidatePaths(
  runRoot: string,
  paths: ReturnType<typeof candidatePaths>,
): void {
  const expectedRoot = path.join(runRoot, CANDIDATE_DIR);
  const expectedSite = path.join(expectedRoot, SITE_DIR);
  const expectedManifest = path.join(expectedRoot, "manifest.json");
  const expectedProvenance = path.join(expectedRoot, "provenance.json");
  const expectedReport = path.join(expectedRoot, "gates.json");
  if (
    paths.root !== expectedRoot ||
    paths.site !== expectedSite ||
    paths.manifest !== expectedManifest ||
    paths.provenance !== expectedProvenance ||
    paths.gates !== expectedReport
  ) {
    throw new Error("candidate paths do not match the closed run layout");
  }
  if (
    path.dirname(paths.root) !== runRoot ||
    path.dirname(paths.site) !== paths.root ||
    path.dirname(paths.gates) !== paths.root
  ) {
    throw new Error("candidate paths escape their validated parent");
  }
}

async function createCandidateGateTarget(runId: string): Promise<GateTarget> {
  // Validate before deriving or touching any filesystem path.
  const parsedRunId = RunIdSchema.safeParse(runId);
  if (!parsedRunId.success) throw new Error("bad runId");
  const runRoot = path.resolve(process.cwd(), SITES_DIR, parsedRunId.data);
  const paths = candidatePaths(parsedRunId.data);
  assertClosedCandidatePaths(runRoot, paths);
  await assertCandidateDirectories({
    runRoot,
    candidateRoot: paths.root,
    siteRoot: paths.site,
  });
  const inspection = await inspectCandidate(parsedRunId.data);
  if (inspection.status !== "present" || !inspection.manifest) {
    throw new Error("candidate is absent or has no validated manifest");
  }
  if (inspection.provenance.state !== "ready-for-gates") {
    throw new Error("candidate must be ready-for-gates");
  }
  await validateCandidateInventory(paths.site, inspection.manifest);
  await validateCandidateInputArtifactHashes(
    parsedRunId.data,
    inspection.provenance.inputArtifactHashes,
  );
  return Object.freeze({
    runRoot,
    siteRoot: paths.site,
    reportPath: paths.gates,
    navigationUrl: pathToFileURL(path.join(paths.site, "index.html")).href,
    candidateBinding: Object.freeze({
      layoutAuthority: inspection.provenance.layoutAuthority,
      compilerVersion: inspection.provenance.compilerVersion,
      ...(inspection.provenance.pageIrSha256
        ? { pageIrSha256: inspection.provenance.pageIrSha256 }
        : {}),
      candidateManifestSha256:
        inspection.provenance.candidateManifestSha256!,
      buildSha256: inspection.provenance.buildSha256!,
      inputArtifactHashes: Object.freeze(
        inspection.provenance.inputArtifactHashes.map((input) =>
          Object.freeze({ ...input }),
        ),
      ),
    }),
  });
}

async function readStableRegularFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  const initial = await fs.lstat(filePath, { bigint: true });
  if (initial.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!initial.isFile()) throw new Error(`${label} must be a regular file`);
  if (initial.nlink > BigInt(1)) throw new Error(`${label} must not be a hardlink`);
  if (initial.size > BigInt(MAX_GATE_INPUT_BYTES)) {
    throw new Error(`${label} exceeds the gate input size limit`);
  }
  const handle = await fs.open(filePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      !sameFile(initial, opened) ||
      opened.size !== initial.size
    ) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || opened.size !== after.size) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function boundInputHash(
  binding: CandidateGateBinding,
  relativePath: string,
): string | undefined {
  return binding.inputArtifactHashes.find((input) => input.path === relativePath)
    ?.sha256;
}

async function snapshotCandidateInput(
  target: GateTarget,
  relativePath: string,
  required: boolean,
): Promise<{ snapshot: GateInputSnapshot; bytes?: Buffer }> {
  const absolutePath = path.join(target.runRoot, relativePath);
  const expected = boundInputHash(target.candidateBinding!, relativePath);
  if (!expected) {
    if (required) {
      throw new Error(`gate input is not bound by provenance: ${relativePath}`);
    }
    try {
      await fs.lstat(absolutePath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        return { snapshot: { relativePath } };
      }
      throw error;
    }
    throw new Error(`gate input is not bound by provenance: ${relativePath}`);
  }
  let bytes: Buffer | undefined;
  try {
    bytes = await readStableRegularFile(absolutePath, relativePath);
  } catch (error) {
    if (
      !required &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      throw new Error(`bound gate input is missing: ${relativePath}`);
    }
    throw error;
  }
  const observedSha256 = sha256(bytes);
  if (expected !== observedSha256) {
    throw new Error(`gate input SHA-256 does not match provenance: ${relativePath}`);
  }
  return {
    snapshot: { relativePath, sha256: observedSha256, provenanceRequired: required },
    bytes,
  };
}

function canonicalizeGateProof(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeGateProof);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalizeGateProof(child)]),
    );
  }
  return value;
}

function pageIrBindingSetSha256(
  runId: string,
  sources: ReadonlyArray<{ kind: string; version: number; sha256: string }>,
): string {
  return sha256(
    JSON.stringify(canonicalizeGateProof({ schemaVersion: 1, runId, sources })),
  );
}

async function snapshotLineageInput(
  target: GateTarget,
  relativePath: string,
  expectedSha256: string,
  label: string,
): Promise<{ snapshot: GateInputSnapshot; bytes: Buffer }> {
  const bytes = await readStableRegularFile(
    path.join(target.runRoot, ...relativePath.split("/")),
    label,
  );
  const observedSha256 = sha256(bytes);
  if (observedSha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 does not match persisted PageIR lineage`);
  }
  return {
    snapshot: {
      relativePath,
      sha256: observedSha256,
      lineageExpectedSha256: expectedSha256,
    },
    bytes,
  };
}

function pageIrNoJsChecks(pageIr: PageIRV1): readonly NoJsCheck[] {
  const selector = (id: string) => `[data-edit-id="${id}"]`;
  const checks: NoJsCheck[] = [
    ["navigation landmark", selector(pageIr.accessibility.navigationNodeId)],
    ["main landmark", selector(pageIr.accessibility.mainNodeId)],
    ["skip target", selector(pageIr.accessibility.skipToNodeId)],
  ];
  for (const binding of pageIr.slotBindings) {
    if (binding.kind === "action") {
      checks.push([`action slot ${binding.nodeId}`, selector(binding.nodeId)]);
    }
  }
  const visibleContentBindings = pageIr.slotBindings.filter(
    (binding) => binding.kind === "heading" || binding.kind === "text",
  );
  const contentBinding =
    visibleContentBindings.find(
      (binding) =>
        "contentId" in binding &&
        binding.contentId === pageIr.accessibility.titleContentId,
    ) ??
    visibleContentBindings.find((binding) => binding.kind === "heading") ??
    visibleContentBindings.find((binding) => binding.kind === "text");
  if (!contentBinding) {
    throw new Error(
      "validated PageIR has no visible heading or text slot for the no-JavaScript gate",
    );
  }
  checks.push([`content slot ${contentBinding.nodeId}`, selector(contentBinding.nodeId)]);
  return Object.freeze(checks.map((check) => Object.freeze(check)));
}

function normalizedPageIrCallTarget(phone: string): string {
  return `tel:${phone.replace(/[ ()-]/g, "")}`;
}

function maskCssNonDeclarationContexts(cssText: string): string {
  const masked = cssText.split("");
  for (let index = 0; index < cssText.length;) {
    if (cssText[index] === "/" && cssText[index + 1] === "*") {
      masked[index++] = " ";
      masked[index++] = " ";
      while (index < cssText.length) {
        const closesComment = cssText[index] === "*" && cssText[index + 1] === "/";
        if (cssText[index] !== "\n" && cssText[index] !== "\r") masked[index] = " ";
        index += 1;
        if (closesComment) {
          if (index < cssText.length) masked[index] = " ";
          index += 1;
          break;
        }
      }
      continue;
    }
    const quote = cssText[index];
    if (quote === '"' || quote === "'") {
      masked[index++] = " ";
      while (index < cssText.length) {
        const character = cssText[index];
        if (character !== "\n" && character !== "\r") masked[index] = " ";
        index += 1;
        if (character === "\\" && index < cssText.length) {
          if (cssText[index] !== "\n" && cssText[index] !== "\r") masked[index] = " ";
          index += 1;
        } else if (character === quote) {
          break;
        }
      }
      continue;
    }
    index += 1;
  }
  const groupClosers: string[] = [];
  for (let index = 0; index < masked.length; index += 1) {
    const character = masked[index];
    if (character === "(" || character === "[") {
      groupClosers.push(character === "(" ? ")" : "]");
      masked[index] = " ";
      continue;
    }
    if (groupClosers.length === 0) continue;
    if (character === groupClosers[groupClosers.length - 1]) groupClosers.pop();
    if (character !== "\n" && character !== "\r") masked[index] = " ";
  }
  return masked.join("");
}

function declaredCustomProperties(cssText: string): Map<string, string[]> {
  const masked = maskCssNonDeclarationContexts(cssText);
  const declarations = new Map<string, string[]>();
  const declarationPattern = /(?:^|[;{])\s*(--[\w-]+)\s*:([^;{}]*)(?=;|})/g;
  let match: RegExpExecArray | null;
  while ((match = declarationPattern.exec(masked))) {
    const colonOffset = match[0].indexOf(":", match[0].indexOf(match[1]) + match[1].length);
    const valueStart = match.index + colonOffset + 1;
    const rawValue = cssText.slice(valueStart, valueStart + match[2].length).trim();
    const values = declarations.get(match[1]) ?? [];
    values.push(rawValue);
    declarations.set(match[1], values);
  }
  return declarations;
}

function normalizedFirstFontFamily(value: string): string | undefined {
  return value
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase() || undefined;
}

function withCssBoundDesignContractTokens(
  allowed: AllowedTokens,
  tokens: DesignTokens,
  tokensCssText: string,
): AllowedTokens {
  const colorRgb = new Set(allowed.colorRgb);
  const fontFirstFamilies = new Set(allowed.fontFirstFamilies);
  const declarations = declaredCustomProperties(tokensCssText);
  for (const color of tokens.colors) {
    const normalizedContract = colorToRgbString(color.value);
    const declared = declarations.get(color.cssVar) ?? [];
    if (
      normalizedContract &&
      declared.length > 0 &&
      declared.every((value) => colorToRgbString(value) === normalizedContract)
    ) {
      colorRgb.add(normalizedContract);
    }
  }
  for (const font of tokens.fonts) {
    const normalizedContract = font.family.toLowerCase();
    const declared = declarations.get(font.cssVar) ?? [];
    if (
      declared.length > 0 &&
      declared.every((value) => normalizedFirstFontFamily(value) === normalizedContract)
    ) {
      fontFirstFamilies.add(normalizedContract);
    }
  }
  return { colorRgb, fontFirstFamilies };
}

async function preparePageIrGateInputs(
  target: GateTarget,
  allowed: AllowedTokens,
  tokensCssText: string,
): Promise<{
  allowed: AllowedTokens;
  tokens: DesignTokens;
  telephoneOracle: TelephoneOracle;
  noJsChecks: readonly NoJsCheck[];
  unresolvedRefs: string[];
  candidateInputSnapshots: readonly GateInputSnapshot[];
}> {
  const pageIrInput = await snapshotCandidateInput(target, ARTIFACTS.pageIr, true);
  const envelope = PersistedPageIrV1Schema.parse(
    JSON.parse(pageIrInput.bytes!.toString("utf8")),
  );
  if (envelope.runId !== path.basename(target.runRoot)) {
    throw new Error("persisted Page IR does not match the candidate run");
  }
  const canonicalPageIrSha256 = pageIrSha256(envelope.pageIr);
  if (canonicalPageIrSha256 !== envelope.pageIrSha256) {
    throw new Error("persisted Page IR canonical SHA-256 mismatch");
  }
  if (envelope.pageIrSha256 !== target.candidateBinding?.pageIrSha256) {
    throw new Error("persisted Page IR does not match candidate provenance");
  }
  if (
    pageIrBindingSetSha256(envelope.runId, envelope.lineage.sources) !==
    envelope.bindingSetSha256
  ) {
    throw new Error("persisted Page IR binding-set SHA-256 mismatch");
  }
  const designContractLineage = envelope.lineage.sources.find(
    (source) => source.kind === "design-contract",
  );
  if (!designContractLineage) {
    throw new Error("persisted Page IR has no design-contract lineage binding");
  }
  const designContractPath = workflowArtifactVersionPath(
    "design-contract",
    designContractLineage.version,
  );
  const designContractInput = await snapshotLineageInput(
    target,
    designContractPath,
    designContractLineage.sha256,
    `PageIR design-contract v${designContractLineage.version}`,
  );
  const designContract = V2DesignContractMetadataSchema.parse(
    JSON.parse(designContractInput.bytes.toString("utf8")),
  );
  if (!designContract.designTokens) {
    throw new Error("PageIR design-contract requires design tokens");
  }
  return {
    allowed: withCssBoundDesignContractTokens(
      allowed,
      designContract.designTokens,
      tokensCssText,
    ),
    tokens: designContract.designTokens,
    telephoneOracle: Object.freeze({
      authority: "page-ir-v1",
      expectedTargets: Object.freeze(
        [
          ...new Set(
            envelope.pageIr.actions.flatMap((action) =>
              action.kind === "call"
                ? [normalizedPageIrCallTarget(action.phone)]
                : [],
            ),
          ),
        ].sort(),
      ),
    }),
    noJsChecks: pageIrNoJsChecks(envelope.pageIr),
    unresolvedRefs: await findUnresolvedSheetRefs(target.siteRoot, tokensCssText),
    candidateInputSnapshots: Object.freeze([
      pageIrInput.snapshot,
      designContractInput.snapshot,
    ]),
  };
}

async function prepareGateInputs(target: GateTarget): Promise<{
  allowed: AllowedTokens;
  tokens: DesignTokens;
  telephoneOracle: TelephoneOracle;
  noJsChecks?: readonly NoJsCheck[];
  unresolvedRefs: string[];
  candidateInputSnapshots?: readonly GateInputSnapshot[];
}> {
  const tokensCssPath = path.join(target.siteRoot, "tokens.css");
  const tokensCssText = target.candidateBinding
    ? (await readStableRegularFile(
        tokensCssPath,
        "candidate tokens.css",
      )).toString("utf8")
    : await fs.readFile(tokensCssPath, "utf8");
  const allowed = parseAllowedTokens(tokensCssText);
  if (!target.candidateBinding) {
    const tokens = DesignTokensSchema.parse(
      JSON.parse(
        await fs.readFile(path.join(target.runRoot, ARTIFACTS.tokens), "utf8"),
      ),
    );
    return {
      allowed,
      tokens,
      telephoneOracle: {
        authority: "template-v1",
        phone: await readIntakePhone(target.runRoot),
      },
      unresolvedRefs: await findUnresolvedSheetRefs(
        target.siteRoot,
        tokensCssText,
      ),
    };
  }

  if (target.candidateBinding.layoutAuthority === "page-ir-v1") {
    return preparePageIrGateInputs(target, allowed, tokensCssText);
  }

  const tokenInput = await snapshotCandidateInput(
    target,
    ARTIFACTS.tokens,
    true,
  );
  const intakeInput = await snapshotCandidateInput(
    target,
    ARTIFACTS.intake,
    false,
  );
  const tokens = DesignTokensSchema.parse(
    JSON.parse(tokenInput.bytes!.toString("utf8")),
  );
  const phone = intakeInput.bytes
    ? IntakeSchema.parse(JSON.parse(intakeInput.bytes.toString("utf8"))).phone
    : undefined;
  return {
    allowed,
    tokens,
    telephoneOracle: { authority: "template-v1", phone },
    unresolvedRefs: await findUnresolvedSheetRefs(
      target.siteRoot,
      tokensCssText,
    ),
    candidateInputSnapshots: [tokenInput.snapshot, intakeInput.snapshot],
  };
}

async function executeGateSuite(
  target: GateTarget,
  gateNames: readonly string[],
  ctx: {
    allowed: AllowedTokens;
    tokens: DesignTokens;
    telephoneOracle: TelephoneOracle;
    noJsChecks?: readonly NoJsCheck[];
    unresolvedRefs: string[];
  },
): Promise<GateReport[]> {
  const browser = await launchEvaluationAwareBrowser();
  const reports: GateReport[] = [];
  try {
    for (const name of gateNames) {
      const report = await runOne(browser, name, target.navigationUrl, {
        ...ctx,
        siteDir: target.siteRoot,
      });
      reports.push(GateReportSchema.parse(report));
    }
  } finally {
    await browser.close();
  }
  return reports;
}

async function revalidateCandidateTarget(
  runId: string,
  target: GateTarget,
  inputSnapshots: readonly GateInputSnapshot[],
): Promise<void> {
  const current = await createCandidateGateTarget(runId);
  if (
    current.runRoot !== target.runRoot ||
    current.siteRoot !== target.siteRoot ||
    current.reportPath !== target.reportPath ||
    current.navigationUrl !== target.navigationUrl ||
    current.candidateBinding?.layoutAuthority !==
      target.candidateBinding?.layoutAuthority ||
    current.candidateBinding?.compilerVersion !==
      target.candidateBinding?.compilerVersion ||
    current.candidateBinding?.pageIrSha256 !==
      target.candidateBinding?.pageIrSha256 ||
    current.candidateBinding?.candidateManifestSha256 !==
      target.candidateBinding?.candidateManifestSha256 ||
    current.candidateBinding?.buildSha256 !==
      target.candidateBinding?.buildSha256 ||
    JSON.stringify(current.candidateBinding?.inputArtifactHashes) !==
      JSON.stringify(target.candidateBinding?.inputArtifactHashes)
  ) {
    throw new Error("candidate binding changed during gate evaluation");
  }
  for (const before of inputSnapshots) {
    const after = before.lineageExpectedSha256
      ? await snapshotLineageInput(
          current,
          before.relativePath,
          before.lineageExpectedSha256,
          `PageIR lineage input ${before.relativePath}`,
        )
      : await snapshotCandidateInput(
          current,
          before.relativePath,
          before.provenanceRequired ?? false,
        );
    if (after.snapshot.sha256 !== before.sha256) {
      throw new Error(
        `gate input changed during candidate evaluation: ${before.relativePath}`,
      );
    }
  }
}

async function atomicWriteCandidateReceipt(
  target: GateTarget,
  bytes: Buffer,
  beforeRename: () => Promise<void>,
): Promise<void> {
  const temporary = path.join(
    target.runRoot,
    `.candidate-gates.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await beforeRename();
    await fs.rename(temporary, target.reportPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function runCandidateGates(
  runId: string,
): Promise<CandidateGateRunResult> {
  const target = await createCandidateGateTarget(runId);
  const prepared = await prepareGateInputs(target);
  const reports = await executeGateSuite(target, FULL_GATE_NAMES, prepared);
  await revalidateCandidateTarget(
    runId,
    target,
    prepared.candidateInputSnapshots!,
  );
  const receipt = CandidateGateReceiptV1Schema.parse({
    schemaVersion: 1,
    runId,
    candidateManifestSha256:
      target.candidateBinding!.candidateManifestSha256,
    buildSha256: target.candidateBinding!.buildSha256,
    reports,
  });
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  const gateReportSha256 = sha256(receiptBytes);
  await atomicWriteCandidateReceipt(target, receiptBytes, () =>
    revalidateCandidateTarget(
      runId,
      target,
      prepared.candidateInputSnapshots!,
    ),
  );
  return { receipt, gateReportSha256 };
}

async function runOne(
  browser: import("playwright").Browser,
  name: string,
  url: string,
  ctx: {
    allowed: AllowedTokens;
    tokens: DesignTokens;
    telephoneOracle: TelephoneOracle;
    noJsChecks?: readonly NoJsCheck[];
    unresolvedRefs: string[];
    siteDir: string;
  }
): Promise<GateReport> {
  switch (name) {
    case "token-drift":
      return withPage(browser, (page) => gateTokenDrift(page, url, ctx.allowed, ctx.unresolvedRefs));
    case "color-role-compliance":
      return withPage(browser, (page) => gateColorRoleCompliance(page, url, ctx.tokens));
    case "axe":
      return withPage(browser, (page) => gateAxe(page, url));
    case "contrast":
      return gateContrast(browser, url, ctx.siteDir);
    case "console-errors":
      return withPage(browser, (page) => gateConsoleErrors(page, url));
    case "assets":
      return withPage(browser, (page) => gateAssets(page, url, ctx.telephoneOracle));
    case "no-js":
      return gateNoJs(browser, url, ctx.noJsChecks);
    case "mobile-layout":
      return gateMobileLayout(browser, url);
    case "perf-budget":
      return withPage(browser, (page) => gatePerfBudget(page, url));
    default:
      throw new Error(`unknown gate: ${name}`);
  }
}

async function withPage<T>(
  browser: import("playwright").Browser,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  // Content-integrity gates care about the settled page, not an in-flight
  // CSS reveal transition — emulating reduced-motion makes reveal.js show
  // every [data-reveal] node at its final state synchronously (see
  // reveal.js), so axe/token-drift never race a mid-fade opacity frame.
  // Motion itself is a design concern the reduced-motion + no-js gates
  // already cover, not something these gates need to re-verify.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function writeGates(runRoot: string, reports: GateReport[]): Promise<void> {
  const target = path.join(runRoot, ARTIFACTS.gates);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(reports, null, 2), "utf8");
  await fs.rename(tmp, target);
}

async function readIntakePhone(runRoot: string): Promise<string | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(runRoot, ARTIFACTS.intake), "utf8"));
    return IntakeSchema.parse(raw).phone;
  } catch {
    return undefined; // no intake.json in this run — tel: check degrades to informational
  }
}

// ---------- (a) token-drift ----------

interface AllowedTokens {
  colorRgb: Set<string>; // normalized "rgb(r, g, b)" / "rgba(r, g, b, a)"
  fontFirstFamilies: Set<string>; // lowercased, quote-stripped
}

function parseAllowedTokens(cssText: string): AllowedTokens {
  const colorRgb = new Set<string>(["rgba(0, 0, 0, 0)", "transparent", "currentcolor"]);
  const fontFirstFamilies = new Set<string>();
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(cssText))) {
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    if (name.startsWith("--color-")) {
      const rgb = colorToRgbString(value);
      if (rgb) colorRgb.add(rgb);
    } else if (name.startsWith("--font-")) {
      const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
      if (first) fontFirstFamilies.add(first.toLowerCase());
    }
  }
  return { colorRgb, fontFirstFamilies };
}

function colorToRgbString(value: string): string | undefined {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) {
      const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (/^rgba?\(/i.test(value)) {
    // Already in functional form — pass through with Chromium's own comma-space
    // normalization so it compares equal to getComputedStyle output.
    const nums = value.match(/[\d.]+/g);
    if (!nums) return undefined;
    return nums.length === 4
      ? `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]})`
      : `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
  }
  // gradients / hsl() / named colors used as a color-*, not rendering-checkable
  // by this gate (see WAVE-NOTES-buildgate.md) — no entry added, not a failure.
  return undefined;
}

async function gateTokenDrift(
  page: Page,
  url: string,
  allowed: AllowedTokens,
  unresolvedRefs: string[] = []
): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const elements = await page.$$eval("body *", (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        editId: el.getAttribute("data-edit-id") ?? "",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontFamily: cs.fontFamily,
      };
    })
  );

  // Listed first: an unresolved reference explains the computed-value
  // failures below it, rather than being buried under forty of them.
  const details: string[] = unresolvedRefs.map(
    (name) => `${name} is referenced by the stylesheets but defined nowhere — every declaration using it is dropped`
  );
  for (const el of elements) {
    if (["script", "style"].includes(el.tag)) continue;
    if (!isAllowedColor(el.color, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> color ${el.color} not in tokens.css`);
    }
    if (!isAllowedColor(el.backgroundColor, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> backgroundColor ${el.backgroundColor} not in tokens.css`);
    }
    if (!isAllowedFont(el.fontFamily, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> fontFamily ${el.fontFamily} not in tokens.css`);
    }
  }

  return {
    gate: "token-drift",
    pass: details.length === 0,
    blocking: true,
    details: details.slice(0, 40),
    ranAt: new Date().toISOString(),
  };
}

function isAllowedColor(value: string, allowed: AllowedTokens): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "inherit" || v === "currentcolor") return true;
  return allowed.colorRgb.has(v) || allowed.colorRgb.has(value.trim());
}

function isAllowedFont(stack: string, allowed: AllowedTokens): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return !!first && allowed.fontFirstFamilies.has(first);
}

// ---------- (a2) color-role-compliance ----------

async function gateColorRoleCompliance(
  page: Page,
  url: string,
  tokens: DesignTokens
): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const tokenHexes = tokens.colors
    .map((color) => normalizeHexColor(color.value))
    .filter((color): color is string => Boolean(color));
  const observations = await page.evaluate((knownTokenHexes) => {
    const knownColors = new Set(knownTokenHexes);
    const observations: Array<{
      editId?: string;
      selector: string;
      context: ForbiddenContext;
      colorHex: string;
    }> = [];
    const seen = new Set<string>();

    const rgbToHex = (value: string): string | undefined => {
      const channels = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
      if (!channels || (channels[4] !== undefined && Number(channels[4]) !== 1)) return undefined;
      return `#${[channels[1], channels[2], channels[3]]
        .map((channel) => Number(channel).toString(16).padStart(2, "0"))
        .join("")}`;
    };
    const selectorFor = (element: Element, editId: string | null): string =>
      editId ? `[data-edit-id="${editId}"]` : element.tagName.toLowerCase();
    const add = (element: Element, editId: string | null, context: ForbiddenContext, value: string) => {
      const colorHex = rgbToHex(value);
      if (!colorHex || !knownColors.has(colorHex)) return;
      const selector = selectorFor(element, editId);
      const key = `${selector}|${context}|${colorHex}`;
      if (seen.has(key)) return;
      seen.add(key);
      observations.push({
        ...(editId ? { editId } : {}),
        selector,
        context,
        colorHex,
      });
    };

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const tag = element.tagName.toLowerCase();
      if (["script", "style"].includes(tag)) continue;
      const styles = getComputedStyle(element);
      const editId = element.getAttribute("data-edit-id");
      const rect = element.getBoundingClientRect();
      const isLargeSurface = rect.width >= window.innerWidth * 0.6 && rect.height >= 200;

      // Interactive controls are button surfaces, never section surfaces —
      // a full-width CTA button must not false-block as a section background
      // (review finding).
      const isInteractive =
        ["button", "a", "input", "select", "textarea"].includes(tag) ||
        element.getAttribute("role") === "button";

      if (tag === "section" || (editId && isLargeSurface && !isInteractive)) {
        add(element, editId, "section-background", styles.backgroundColor);
      }
      if (isLargeSurface && !isInteractive) {
        add(element, editId, "large-surface", styles.backgroundColor);
      }
      // span is excluded: eyebrow/badge chrome shares the tag with prose and
      // false-blocks accent colors (review finding). Real copy lives in p/li.
      if (["p", "li"].includes(tag)) add(element, editId, "body-text", styles.color);
      if (/^h[1-6]$/.test(tag)) add(element, editId, "heading-text", styles.color);
      if (tag === "button" || element.getAttribute("role") === "button") {
        add(element, editId, "button-background", styles.backgroundColor);
      }
      // Zero-width borders still report a computed color (usually
      // currentColor), which false-blocks text tokens that ban borders
      // (review finding) — only sample borders that actually paint.
      const borders: Array<[string, string, string]> = [
        [styles.borderTopWidth, styles.borderTopStyle, styles.borderTopColor],
        [styles.borderRightWidth, styles.borderRightStyle, styles.borderRightColor],
        [styles.borderBottomWidth, styles.borderBottomStyle, styles.borderBottomColor],
        [styles.borderLeftWidth, styles.borderLeftStyle, styles.borderLeftColor],
      ];
      for (const [borderWidth, borderStyle, borderColor] of borders) {
        if (parseFloat(borderWidth) > 0 && borderStyle !== "none" && borderStyle !== "hidden") {
          add(element, editId, "border", borderColor);
        }
      }
    }
    return observations;
  }, tokenHexes);
  const violations = evaluateColorRoleCompliance(observations, tokens);

  return {
    gate: "color-role-compliance",
    pass: violations.length === 0,
    blocking: true,
    details: violations.map(
      (violation) =>
        `${violation.selector} uses ${violation.tokenName} (${violation.colorHex}) in forbidden ${violation.context}`
    ),
    ranAt: new Date().toISOString(),
  };
}

// ---------- (b) axe ----------

async function gateAxe(page: Page, url: string): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return {
    gate: "axe",
    pass: serious.length === 0,
    blocking: true,
    details: results.violations.map((v) => `${v.impact ?? "n/a"}: ${v.id} — ${v.help} (${v.nodes.length} node(s))`),
    ranAt: new Date().toISOString(),
  };
}

// ---------- (c) console-errors ----------

async function gateConsoleErrors(page: Page, url: string): Promise<GateReport> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(300); // let async reveal/counter code settle
  return {
    gate: "console-errors",
    pass: errors.length === 0,
    blocking: true,
    details: errors,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (d) assets ----------

function normalizeRenderedPageIrTelTarget(href: string): string {
  return `tel:${href.slice("tel:".length).replace(/[ ()-]/g, "")}`;
}

async function gateAssets(
  page: Page,
  url: string,
  telephoneOracle: TelephoneOracle,
): Promise<GateReport> {
  const badResponses: string[] = [];
  page.on("response", (res) => {
    if (!res.ok() && res.status() !== 0) badResponses.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    badResponses.push(`FAILED ${req.url()} (${req.failure()?.errorText ?? "unknown"})`);
  });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(200);

  const details: string[] = [...new Set(badResponses)];

  const anchors = await page.$$eval("a[href]", (els) => els.map((el) => el.getAttribute("href") ?? ""));
  for (const href of anchors) {
    if (!href.startsWith("#") || href === "#") continue;
    const id = href.slice(1);
    const found = await page.locator(`[id="${id}"]`).count();
    if (found === 0) details.push(`internal anchor href="${href}" has no matching id`);
  }

  const telLinks = await page.$$eval("a[href^='tel:']", (els) =>
    els.map((el) => el.getAttribute("href") ?? "")
  );
  if (telephoneOracle.authority === "template-v1") {
    const phone = telephoneOracle.phone;
    if (phone) {
      const expectedDigits = phone.replace(/[^\d]/g, "");
      for (const href of telLinks) {
        const hrefDigits = href.replace(/[^\d]/g, "");
        if (hrefDigits !== expectedDigits) {
          details.push(`tel: link "${href}" does not match intake phone "${phone}"`);
        }
      }
    } else if (telLinks.length === 0) {
      details.push("no intake.json phone available and no tel: links found — nothing to verify");
    }
  } else {
    const expected = new Set(telephoneOracle.expectedTargets);
    const observed = new Set(telLinks.map(normalizeRenderedPageIrTelTarget));
    for (const href of observed) {
      if (!expected.has(href)) details.push(`unexpected PageIR tel: target "${href}"`);
    }
    for (const href of expected) {
      if (!observed.has(href)) {
        details.push(`expected PageIR tel: target "${href}" was not rendered`);
      }
    }
  }

  return {
    gate: "assets",
    pass:
      details.length === 0 ||
      (telephoneOracle.authority === "template-v1" &&
        details.length === 1 &&
        details[0].startsWith("no intake.json")),
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (e) no-js ----------

const TEMPLATE_NO_JS_CHECKS: readonly NoJsCheck[] = [
  ["hero headline", '[data-edit-id="hero.headline"]'],
  ["nav", "nav"],
  ["contact CTA", '[data-edit-id="contact.cta"]'],
];

async function gateNoJs(
  browser: import("playwright").Browser,
  url: string,
  checks: readonly NoJsCheck[] = TEMPLATE_NO_JS_CHECKS,
): Promise<GateReport> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    for (const [label, selector] of checks) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (!visible) details.push(`${label} (${selector}) not visible with JavaScript disabled`);
    }
  } finally {
    await context.close();
  }
  return {
    gate: "no-js",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (f) mobile-layout ----------

/**
 * 390px invariants. Two failure modes that desktop review never catches and
 * that both shipped live before this gate existed:
 *
 * (1) horizontal overflow — anything wider than the viewport;
 * (2) word-stacking — a short label squeezed so narrow that each word wraps
 *     to its own line (a 14-char phone number rendered over 3 lines). Any
 *     leaf element with a short string across ≥3 lines is a squeeze, since
 *     no deliberate design breaks a 40-character label that way.
 */
async function gateMobileLayout(
  browser: import("playwright").Browser,
  url: string
): Promise<GateReport> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  let details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    details = await page.evaluate(() => {
      const out: string[] = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        out.push(
          `page scrolls horizontally: content ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`
        );
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1) {
          out.push(
            `<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ""}> overflows the viewport (right edge ${Math.round(rect.right)}px)`
          );
        }
        const text = (el.textContent ?? "").trim();
        if (!text || text.length > 40) continue;
        if (el.children.length > 0) continue; // leaf text nodes only
        // Count real line boxes via a Range — height/line-height overcounts
        // on padded elements (a one-line button reads as three).
        const node = el.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getClientRects().length;
        // A long headline wrapping to 4 lines is design; a 14-character phone
        // number over 3 lines is a squeeze. Characters-per-line separates
        // them — word-stacking always lands far below a normal line's worth.
        if (lines >= 3 && text.length / lines < 8) {
          out.push(
            `"${text}" wraps to ${lines} lines at 390px (element only ${Math.round(rect.width)}px wide)`
          );
        }
      }
      return out.slice(0, 20);
    });
  } finally {
    await context.close();
  }
  return {
    gate: "mobile-layout",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (g) perf-budget (advisory) ----------

async function gatePerfBudget(page: Page, url: string): Promise<GateReport> {
  let totalBytes = 0;
  let imageBytes = 0;
  const responseSizes: Promise<void>[] = [];

  page.on("response", (res) => {
    const p = res
      .request()
      .sizes()
      .then((sizes) => {
        const bytes = sizes.responseBodySize + sizes.responseHeadersSize;
        totalBytes += bytes;
        const ct = res.headers()["content-type"] ?? "";
        if (ct.startsWith("image/")) imageBytes += bytes;
      })
      .catch(() => undefined);
    responseSizes.push(p);
  });

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: PERF_BUDGET.cpuThrottleRate });

  await page.goto(url, { waitUntil: "load" });
  await Promise.all(responseSizes);

  const dcl = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav ? Math.round(nav.domContentLoadedEventEnd) : -1;
  });

  const pass =
    totalBytes < PERF_BUDGET.totalBytes && imageBytes < PERF_BUDGET.imageBytes && dcl >= 0 && dcl < PERF_BUDGET.domContentLoadedMs;

  return {
    gate: "perf-budget",
    pass,
    blocking: false,
    details: [
      `total transfer: ${Math.round(totalBytes / 1024)}KB (budget ${PERF_BUDGET.totalBytes / 1024}KB)`,
      `image bytes: ${Math.round(imageBytes / 1024)}KB (budget ${PERF_BUDGET.imageBytes / 1024}KB)`,
      `DOMContentLoaded: ${dcl}ms at ${PERF_BUDGET.cpuThrottleRate}x CPU throttle (budget ${PERF_BUDGET.domContentLoadedMs}ms)`,
    ],
    ranAt: new Date().toISOString(),
  };
}
