import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const failures = [];
const digestInputs = new Map();

const allowedClasses = new Set([
  "owner-approved",
  "owner-approved-direction",
  "owner-approved-architecture",
  "proposed",
  "draft",
  "research",
  "rejected",
  "historical",
]);
const ownerApprovedClasses = new Set([
  "owner-approved",
  "owner-approved-direction",
  "owner-approved-architecture",
]);
const ticketStatuses = new Set([
  "proposed",
  "in-review",
  "blocked",
  "ready",
  "in-progress",
  "verification",
  "done",
]);
const ticketPriorities = new Set(["P0", "P1", "P2", "P3"]);
const activeTicketStatuses = new Set(["ready", "in-progress", "verification", "done"]);
const evaluationTiers = new Set(["T0", "T1", "T2", "T3", "T4", "T5"]);
const evaluationStatuses = new Set(["planned", "active", "retired"]);
const decisions = new Set([
  "retain",
  "adopt",
  "adapt",
  "evaluate",
  "learn",
  "needs-license-review",
  "blocked",
  "reject",
]);
const allowedUseDecisions = new Set(["retain", "adopt"]);
const expectedDomains = {
  "website-source": ["docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md", "owner-approved"],
  canvas: ["docs/specs/2026-08-16-canvas-upgrade.md", "owner-approved"],
  "website-lifecycle": ["docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md", "owner-approved-direction"],
  "program-order": ["docs/superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md", "owner-approved-direction"],
  "appointment-acquisition": ["docs/specs/2026-08-27-appointment-acquisition-v1-prd.md", "owner-approved-architecture"],
  "engineering-operating-system": ["docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md", "proposed"],
  "release-1": ["docs/plans/one-box-master/01-foundation/release-1-contract.md", "proposed"],
  compatibility: ["docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md", "proposed"],
  "target-topology": ["docs/adr/0002-target-desktop-cloud-topology.md", "proposed"],
  "program-security": ["docs/security/2026-08-29-program-threat-model.md", "proposed"],
  "program-evaluation": ["docs/eval/one-box-program/evaluation-strategy.md", "proposed"],
  "supply-chain": ["docs/security/supply-chain-policy.md", "proposed"],
  "program-tickets": ["docs/tickets/one-box-program/manifest.json", "proposed"],
  "mpa-reconciliation": ["docs/plans/one-box-master/00-authority/2026-08-29-mpa-reconciliation.md", "proposed"],
  "operating-environment": ["docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md", "draft"],
  "embedded-browser": ["docs/plans/2026-08-29-embedded-browser-integration.md", "proposed"],
  "technology-adoption": ["docs/plans/one-box-master/06-technology/technology-adoption-roadmap.md", "research"],
};

function fail(message) {
  failures.push(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readText(path, label = path) {
  const absolute = safeFile(path, label);
  if (!absolute) return null;
  try {
    return readFileSync(absolute, "utf8");
  } catch (error) {
    fail(`${label}: cannot read (${error.message})`);
    return null;
  }
}

function readJson(path) {
  const text = readText(path);
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    if (!isPlainObject(value)) {
      fail(`${path}: top level must be a JSON object`);
      return null;
    }
    return value;
  } catch (error) {
    fail(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

function repositoryRelativePath(path, label) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || normalize(path).startsWith("..")) {
    fail(`${label}: path must stay relative to the repository`);
    return null;
  }
  const absolute = resolve(root, path);
  const lexical = relative(root, absolute);
  if (lexical === "" || lexical.startsWith("..") || lexical.startsWith(`..${join("", "/")}`)) {
    fail(`${label}: path escapes repository (${path})`);
    return null;
  }
  return absolute;
}

function safeFile(path, label) {
  const absolute = repositoryRelativePath(path, label);
  if (!absolute) return null;
  try {
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      fail(`${label}: missing non-symlink regular file ${path}`);
      return null;
    }
    const real = realpathSync(absolute);
    const containment = relative(root, real);
    if (containment.startsWith("..") || resolve(root, containment) !== real) {
      fail(`${label}: resolved file escapes repository ${path}`);
      return null;
    }
    return real;
  } catch (error) {
    fail(`${label}: cannot inspect ${path} (${error.message})`);
    return null;
  }
}

function addDigest(path, label = path) {
  if (digestInputs.has(path)) return;
  const absolute = safeFile(path, label);
  if (!absolute) return;
  try {
    digestInputs.set(path, readFileSync(absolute));
  } catch (error) {
    fail(`${label}: cannot hash (${error.message})`);
  }
}

function filesUnder(path) {
  const absolute = repositoryRelativePath(path, path);
  if (!absolute || !existsSync(absolute)) {
    fail(`${path}: missing directory`);
    return [];
  }
  const output = [];
  try {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) output.push(...filesUnder(child));
      else if (entry.isFile()) output.push(child);
      else fail(`${child}: symlinks and special files are not allowed in checked packet directories`);
    }
  } catch (error) {
    fail(`${path}: cannot enumerate (${error.message})`);
  }
  return output;
}

function validateLocalLinks(path) {
  const text = readText(path);
  if (text === null) return;
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const withoutFragment = target.split("#", 1)[0];
    if (!withoutFragment) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      fail(`${path}: malformed link ${target}`);
      continue;
    }
    const absolute = resolve(root, dirname(path), decoded);
    const containment = relative(root, absolute);
    if (containment.startsWith("..") || !existsSync(absolute)) {
      fail(`${path}: broken or external local link ${target}`);
    }
  }
}

const authorityPath = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const evalPath = "docs/eval/one-box-program/manifest.json";
const ticketPath = "docs/tickets/one-box-program/manifest.json";
const ticketBodyContractPath = "docs/tickets/one-box-program/ticket-body-contract.json";
const requirementVocabularyPath = "docs/tickets/one-box-program/requirement-vocabulary.json";
const ledgerPath = "docs/research/source-catalog/adoption-ledger.json";
const traceabilityPath = "docs/eval/one-box-program/traceability.md";
const embeddedBrowserClosurePath = "docs/security/2026-08-29-embedded-browser-closure-requirements.md";
const ciWorkflowPath = ".github/workflows/ci.yml";

const authority = readJson(authorityPath);
const evalManifest = readJson(evalPath);
const ticketManifest = readJson(ticketPath);
const ticketBodyContract = readJson(ticketBodyContractPath);
const requirementVocabulary = readJson(requirementVocabularyPath);
const adoptionLedger = readJson(ledgerPath);

const allowedRequirements = new Set(requirementVocabulary?.allowedIds ?? []);
if (requirementVocabulary) {
  if (requirementVocabulary.schemaVersion !== 1 || requirementVocabulary.status !== "proposed" || requirementVocabulary.implementationAuthorized !== false || requirementVocabulary.allowOnlyExactIds !== true) {
    fail("requirement vocabulary: invalid planning contract metadata");
  }
  if (!Array.isArray(requirementVocabulary.allowedIds) || requirementVocabulary.allowedIds.length === 0 || allowedRequirements.size !== requirementVocabulary.allowedIds.length) {
    fail("requirement vocabulary: allowedIds must be a non-empty unique array");
  }
}
if (ticketBodyContract) {
  if (ticketBodyContract.schemaVersion !== 1 || ticketBodyContract.status !== "proposed" || ticketBodyContract.implementationAuthorized !== false) {
    fail("ticket-body contract: invalid planning contract metadata");
  }
  if (ticketBodyContract.manifestPath !== ticketPath) fail("ticket-body contract: manifestPath drift");
  if (!Array.isArray(ticketBodyContract.requiredSections) || ticketBodyContract.requiredSections.length === 0) fail("ticket-body contract: requiredSections must be non-empty");
}

if (authority) {
  if (authority.schemaVersion !== 1) fail("authority manifest: unsupported schemaVersion");
  if (authority.program !== "ONE BOX") fail("authority manifest: invalid program");
  if (authority.status !== "planning-reconciliation") fail("authority manifest: invalid status");
  if (authority.implementationAuthorized !== false) fail("authority manifest: reconciliation cannot authorize implementation");
  if (!isPlainObject(authority.domains) || Object.keys(authority.domains).length === 0) fail("authority manifest: domains must be a non-empty object");
  const releasePolicy = authority.governancePolicies?.productionRelease;
  const reviewPolicy = authority.governancePolicies?.modelReview;
  if (!isPlainObject(authority.governancePolicies)) fail("authority manifest: missing governancePolicies");
  if (!isPlainObject(releasePolicy) || releasePolicy.minimumDistinctActiveHumans !== 2 || releasePolicy.initiatorMayApprove !== false || releasePolicy.emergencyRollback?.newBytesAllowed !== false || releasePolicy.emergencyRollback?.independentReviewWithinHours !== 24) {
    fail("authority manifest: productionRelease policy must require two humans and bounded 24-hour-reviewed rollback");
  }
  if (!isPlainObject(reviewPolicy) || reviewPolicy.exactRequestedModelRequired !== true || reviewPolicy.ownerAuthorizedFallbackAllowed !== true || reviewPolicy.supplementalReviewAllowed !== true || reviewPolicy.modelAuthority !== "advisory-only" || reviewPolicy.targetChangeInvalidatesReceipt !== true) {
    fail("authority manifest: modelReview policy must preserve exact labeling, authorized fallback, advisory authority, and hash invalidation");
  }
  for (const [id, [primaryPath, authorityClass]] of Object.entries(expectedDomains)) {
    const domain = authority.domains?.[id];
    if (!isPlainObject(domain)) {
      fail(`authority manifest: missing domain ${id}`);
      continue;
    }
    if (domain.primaryPath !== primaryPath) fail(`${id}: primaryPath drift; expected ${primaryPath}`);
    if (domain.authorityClass !== authorityClass) fail(`${id}: authorityClass drift; expected ${authorityClass}`);
  }
  for (const id of Object.keys(authority.domains ?? {})) {
    if (!expectedDomains[id]) fail(`authority manifest: unexpected domain ${id}`);
  }
  for (const [id, domain] of Object.entries(authority.domains ?? {})) {
    if (!isPlainObject(domain)) {
      fail(`${id}: domain must be an object`);
      continue;
    }
    if (!allowedClasses.has(domain.authorityClass)) fail(`${id}: invalid authorityClass ${domain.authorityClass}`);
    if (domain.implementationAuthorized !== false) fail(`${id}: this planning manifest cannot authorize implementation`);
    if (ownerApprovedClasses.has(domain.authorityClass)) {
      const record = domain.acceptanceRecord;
      if (!isPlainObject(record) || typeof record.acceptedBy !== "string" || typeof record.recordedAt !== "string" || typeof record.evidence !== "string") {
        fail(`${id}: owner-approved class requires acceptedBy, recordedAt, and evidence`);
      }
      if (typeof record?.identityRef !== "string" || !record.identityRef.startsWith("person:") || typeof record?.role !== "string" || record.role.length === 0) {
        fail(`${id}: owner-approved class requires durable human identityRef and role`);
      }
    }
    for (const prefix of authority.forbiddenPrimaryPathPrefixes ?? []) {
      if (domain.primaryPath?.startsWith(prefix)) fail(`${id}: ${prefix} cannot be a primary authority`);
    }
    addDigest(domain.primaryPath, `${id}.primaryPath`);
    if (typeof domain.boundary !== "string" || domain.boundary.length < 20) fail(`${id}: missing explicit boundary`);
    if (domain.relatedPaths !== undefined && !Array.isArray(domain.relatedPaths)) fail(`${id}: relatedPaths must be an array`);
    for (const path of domain.relatedPaths ?? []) {
      safeFile(path, `${id}.relatedPaths entry`);
      if (!path.startsWith("docs/audits/")) addDigest(path, `${id}.relatedPaths entry`);
    }
  }
  for (const name of allowedClasses) {
    if (typeof authority.authorityClassDefinitions?.[name] !== "string") fail(`authority manifest: missing definition for ${name}`);
  }
  if (!(authority.forbiddenPrimaryPathPrefixes ?? []).includes("docs/audits/")) fail("authority manifest: audit primary-path prohibition is not machine-readable");
  if (!(authority.domains?.["embedded-browser"]?.relatedPaths ?? []).includes(embeddedBrowserClosurePath)) {
    fail(`embedded-browser: missing required related path ${embeddedBrowserClosurePath}`);
  }
  for (const [kind, paths] of [["supportingEvidence", authority.supportingEvidence], ["historicalOrSubordinate", authority.historicalOrSubordinate]]) {
    if (!Array.isArray(paths)) fail(`authority manifest: ${kind} must be an array`);
    else for (const path of paths) safeFile(path, `${kind} entry`);
  }
}

const tickets = new Map();
const assignments = new Map();
if (ticketManifest) {
  if (ticketManifest.schemaVersion !== 2) fail("ticket manifest: unsupported schemaVersion");
  if (ticketManifest.backlogVersion !== "2.0.0") fail("ticket manifest: unsupported backlogVersion");
  if (ticketManifest.status !== "planning") fail("ticket manifest: invalid status");
  if (ticketManifest.implementationAuthorized !== false) fail("ticket manifest: cannot authorize implementation");
  if (ticketManifest.readme !== "docs/tickets/one-box-program/README.md") fail("ticket manifest: readme path drift");
  if (ticketManifest.evalManifest !== evalPath) fail("ticket manifest: evalManifest path drift");
  safeFile(ticketManifest.readme, "ticket manifest readme");
  safeFile(ticketManifest.evalManifest, "ticket manifest evalManifest");
  if (!Array.isArray(ticketManifest.tickets) || ticketManifest.tickets.length === 0) fail("ticket manifest: tickets must be a non-empty array");
  if (!isPlainObject(ticketManifest.humanAssignments) || !Array.isArray(ticketManifest.humanAssignments.records)) {
    fail("ticket manifest: humanAssignments.records must exist");
  } else {
    for (const record of ticketManifest.humanAssignments.records) {
      if (!isPlainObject(record) || typeof record.ticketId !== "string") {
        fail("ticket manifest: invalid human assignment record");
        continue;
      }
      if (assignments.has(record.ticketId)) fail(`ticket manifest: duplicate human assignment ${record.ticketId}`);
      assignments.set(record.ticketId, record);
    }
  }
  if (ticketBodyContract && JSON.stringify(ticketManifest.requiredTicketSections) !== JSON.stringify(ticketBodyContract.requiredSections)) {
    fail("ticket manifest: requiredTicketSections drift from ticket-body contract");
  }
  for (const ticket of ticketManifest.tickets ?? []) {
    if (!isPlainObject(ticket) || typeof ticket.id !== "string") {
      fail("ticket manifest: ticket must be an object with id");
      continue;
    }
    if (tickets.has(ticket.id)) fail(`ticket manifest: duplicate ${ticket.id}`);
    tickets.set(ticket.id, ticket);
    for (const field of ["title", "status", "priority", "epic", "ownerRole", "size", "file"]) {
      if (typeof ticket[field] !== "string" || ticket[field].length === 0) fail(`${ticket.id}: missing ${field}`);
    }
    if (!ticketStatuses.has(ticket.status)) fail(`${ticket.id}: invalid status ${ticket.status}`);
    if (!ticketPriorities.has(ticket.priority)) fail(`${ticket.id}: invalid priority ${ticket.priority}`);
    if (ticket.status === "in-review" && !["planning", "implementation"].includes(ticket.reviewStage)) fail(`${ticket.id}: in-review requires planning or implementation reviewStage`);
    if (!Array.isArray(ticket.dependsOn)) fail(`${ticket.id}: dependsOn must be an array`);
    if (!Array.isArray(ticket.requirements) || ticket.requirements.length === 0) fail(`${ticket.id}: requirements must be non-empty`);
    if (!Array.isArray(ticket.evaluations) || ticket.evaluations.length === 0) fail(`${ticket.id}: evaluations must be non-empty`);
    for (const requirement of ticket.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${ticket.id}: invalid requirement ${requirement}`);
    const ticketFile = `docs/tickets/one-box-program/${ticket.file}`;
    const body = readText(ticketFile, `${ticket.id}.file`);
    addDigest(ticketFile, `${ticket.id}.file`);
    if (body !== null) {
      for (const heading of ticketManifest.requiredTicketSections ?? []) {
        if (!body.includes(`## ${heading}`)) fail(`${ticket.id}: ticket body missing section ${heading}`);
      }
      for (const token of [`id: ${ticket.id}`, `status: ${ticket.status}`, `priority: ${ticket.priority}`, `epic: ${ticket.epic}`, `owner-role: ${ticket.ownerRole}`]) {
        if (!body.includes(token)) fail(`${ticket.id}: ticket body drift for ${token}`);
      }
      const dependencyLine = `depends-on: ${ticket.dependsOn.length === 0 ? "none" : ticket.dependsOn.join(", ")}`;
      if (!body.includes(dependencyLine)) fail(`${ticket.id}: ticket body dependency list drift`);
      if (ticket.dependencySemantics && !body.includes(`dependency-semantics: ${ticket.dependencySemantics}`)) fail(`${ticket.id}: ticket body dependency semantics drift`);
      const requirementLine = `requirements: ${ticket.requirements.join(", ")}`;
      const evaluationLine = `evaluations: ${ticket.evaluations.join(", ")}`;
      if (!body.includes(requirementLine)) fail(`${ticket.id}: ticket body requirement list drift`);
      if (!body.includes(evaluationLine)) fail(`${ticket.id}: ticket body evaluation list drift`);
    }
  }
  for (const ticket of tickets.values()) {
    for (const dependency of ticket.dependsOn ?? []) {
      if (!tickets.has(dependency)) fail(`${ticket.id}: unknown dependency ${dependency}`);
      else if (activeTicketStatuses.has(ticket.status) && tickets.get(dependency).status !== "done") fail(`${ticket.id}: ${ticket.status} requires done dependency ${dependency}`);
    }
    if (activeTicketStatuses.has(ticket.status)) {
      const assignment = assignments.get(ticket.id);
      if (!isPlainObject(assignment) || !assignment.accountableOwner || !assignment.nonAuthorVerifier) fail(`${ticket.id}: ${ticket.status} requires accountableOwner and nonAuthorVerifier assignment`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      fail(`ticket manifest: dependency cycle includes ${id}`);
      return;
    }
    if (visited.has(id) || !tickets.has(id)) return;
    visiting.add(id);
    for (const dependency of tickets.get(id).dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tickets.keys()) visit(id);
}

function ticketDependsOn(ticketId, possibleDependency, seen = new Set()) {
  if (ticketId === possibleDependency) return true;
  if (seen.has(ticketId) || !tickets.has(ticketId)) return false;
  seen.add(ticketId);
  return (tickets.get(ticketId).dependsOn ?? []).some((dependency) => ticketDependsOn(dependency, possibleDependency, seen));
}

const evaluations = new Map();
const evaluationReferences = new Map();
if (evalManifest) {
  if (evalManifest.schemaVersion !== 2) fail("evaluation manifest: unsupported schemaVersion");
  if (evalManifest.program !== "ONE BOX") fail("evaluation manifest: invalid program");
  if (evalManifest.status !== "planning-baseline") fail("evaluation manifest: invalid status");
  if (evalManifest.implementationAuthorized !== false) fail("evaluation manifest: cannot authorize implementation");
  if (!Array.isArray(evalManifest.evaluations) || evalManifest.evaluations.length === 0) fail("evaluation manifest: evaluations must be a non-empty array");
  for (const evaluation of evalManifest.evaluations ?? []) {
    if (!isPlainObject(evaluation) || typeof evaluation.id !== "string") {
      fail("evaluation manifest: evaluation must be an object with id");
      continue;
    }
    if (evaluations.has(evaluation.id)) fail(`evaluation manifest: duplicate ${evaluation.id}`);
    evaluations.set(evaluation.id, evaluation);
    for (const field of ["title", "tier", "method", "status", "ownerTicket", "ownerRole", "fixtureRef", "oracleType", "evidenceClass", "oracle"]) {
      if (typeof evaluation[field] !== "string" || evaluation[field].length === 0) fail(`${evaluation.id}: missing ${field}`);
    }
    if (!evaluationTiers.has(evaluation.tier)) fail(`${evaluation.id}: invalid tier ${evaluation.tier}`);
    if (!evaluationStatuses.has(evaluation.status)) fail(`${evaluation.id}: invalid status ${evaluation.status}`);
    if (typeof evaluation.blocking !== "boolean") fail(`${evaluation.id}: blocking must be boolean`);
    if (!Array.isArray(evaluation.requirements) || evaluation.requirements.length === 0) fail(`${evaluation.id}: requirements must be non-empty`);
    if (!Array.isArray(evaluation.prerequisites) || evaluation.prerequisites.length === 0) fail(`${evaluation.id}: prerequisites must be non-empty`);
    for (const requirement of evaluation.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${evaluation.id}: invalid requirement ${requirement}`);
    if (!tickets.has(evaluation.ownerTicket)) fail(`${evaluation.id}: unknown ownerTicket ${evaluation.ownerTicket}`);
  }
  for (const ticket of tickets.values()) {
    const coveredRequirements = new Set();
    for (const evaluationId of ticket.evaluations ?? []) {
      if (!evaluations.has(evaluationId)) fail(`${ticket.id}: unknown evaluation ${evaluationId}`);
      else {
        const evaluation = evaluations.get(evaluationId);
        for (const requirement of evaluation.requirements ?? []) coveredRequirements.add(requirement);
        if (evaluation.ownerTicket !== ticket.id && ticketDependsOn(evaluation.ownerTicket, ticket.id)) {
          fail(`${ticket.id}: evaluation ${evaluationId} owner ${evaluation.ownerTicket} depends on its consuming ticket`);
        }
      }
      if (!evaluationReferences.has(evaluationId)) evaluationReferences.set(evaluationId, new Set());
      evaluationReferences.get(evaluationId).add(ticket.id);
    }
    for (const requirement of ticket.requirements ?? []) {
      if (!coveredRequirements.has(requirement)) fail(`${ticket.id}: requirement ${requirement} is not covered by linked evaluations`);
    }
  }
  for (const evaluation of evaluations.values()) {
    const references = evaluationReferences.get(evaluation.id) ?? new Set();
    if (references.size === 0) fail(`${evaluation.id}: not referenced by any ticket`);
    if (!references.has(evaluation.ownerTicket)) fail(`${evaluation.id}: ownerTicket ${evaluation.ownerTicket} does not list the evaluation`);
    if (evaluation.fixtureRef.startsWith("planned:") && activeTicketStatuses.has(tickets.get(evaluation.ownerTicket)?.status)) fail(`${evaluation.id}: planned fixture cannot support active owner ticket`);
  }
  for (const inherited of evalManifest.inheritedManifests ?? []) {
    if (!isPlainObject(inherited) || typeof inherited.path !== "string" || !/^[a-f0-9]{64}$/.test(inherited.sha256 ?? "")) {
      fail("evaluation manifest: invalid inherited manifest pin");
      continue;
    }
    const text = readText(inherited.path, "evaluation inherited manifest");
    if (text !== null && createHash("sha256").update(text).digest("hex") !== inherited.sha256) fail(`evaluation manifest: inherited hash drift ${inherited.path}`);
    addDigest(inherited.path, "evaluation inherited manifest");
  }
}

if (adoptionLedger) {
  if (adoptionLedger.schemaVersion !== 2) fail("adoption ledger: unsupported schemaVersion");
  if (adoptionLedger.status !== "planning-baseline-incomplete") fail("adoption ledger: invalid status");
  if (adoptionLedger.implementationAuthorized !== false) fail("adoption ledger: cannot authorize implementation");
  if (!Array.isArray(adoptionLedger.entries) || adoptionLedger.entries.length === 0) fail("adoption ledger: entries must be a non-empty array");
  const licenseStatuses = new Set(adoptionLedger.vocabulary?.licenseStatuses ?? []);
  const identityTypes = new Set(adoptionLedger.vocabulary?.identityTypes ?? []);
  const ids = new Set();
  for (const entry of adoptionLedger.entries ?? []) {
    if (!isPlainObject(entry) || typeof entry.id !== "string") {
      fail("adoption ledger: entry must be an object with id");
      continue;
    }
    if (ids.has(entry.id)) fail(`adoption ledger: duplicate ${entry.id}`);
    ids.add(entry.id);
    for (const field of ["name", "category", "source", "decisionSource", "identity", "license", "phase", "boundedUse", "decision", "recordCompleteness", "permissionsSummary", "dataClass", "telemetry", "ownerRole", "stopGate", "qualificationOracle", "killOrRemoval", "ownerTicket"]) {
      if (entry[field] === undefined || entry[field] === "") fail(`${entry.id}: missing ${field}`);
    }
    if (!decisions.has(entry.decision)) fail(`${entry.id}: invalid decision ${entry.decision}`);
    if (!licenseStatuses.has(entry.license?.status)) fail(`${entry.id}: invalid license status ${entry.license?.status}`);
    if (!identityTypes.has(entry.identity?.type)) fail(`${entry.id}: invalid identity type ${entry.identity?.type}`);
    if (!Array.isArray(entry.missingControls)) fail(`${entry.id}: missingControls must be an array`);
    for (const allowance of ["codeUseAllowed", "serviceUseAllowed", "releaseUseAllowed", "expansionAllowed"]) {
      if (typeof entry[allowance] !== "boolean") fail(`${entry.id}: ${allowance} must be boolean`);
    }
    const anyAllowed = entry.codeUseAllowed || entry.serviceUseAllowed || entry.releaseUseAllowed || entry.expansionAllowed;
    if (anyAllowed && !allowedUseDecisions.has(entry.decision)) fail(`${entry.id}: ${entry.decision} cannot allow use`);
    if (anyAllowed && entry.recordCompleteness !== "complete") fail(`${entry.id}: incomplete entry cannot allow use`);
    if (entry.recordCompleteness === "incomplete" && entry.missingControls.length === 0) fail(`${entry.id}: incomplete entry must name missingControls`);
    if (entry.recordCompleteness === "incomplete" && anyAllowed) fail(`${entry.id}: incomplete allowances must all be false`);
    if (["unselected", "service-unselected", "model-unselected", "mutable-tag"].includes(entry.identity?.type) && anyAllowed) fail(`${entry.id}: unresolved identity cannot allow use`);
    if (!tickets.has(entry.ownerTicket)) fail(`${entry.id}: unknown ownerTicket ${entry.ownerTicket}`);
  }
}

const traceability = readText(traceabilityPath);
if (traceability !== null) {
  for (let index = 1; index <= 19; index += 1) {
    const id = `EOS-${String(index).padStart(3, "0")}`;
    const matches = traceability.match(new RegExp(`^\\| ${id.replace("-", "\\-")} `, "gm")) ?? [];
    if (matches.length !== 1) fail(`program traceability: ${id} must have exactly one table row`);
    const row = traceability.split("\n").find((line) => line.startsWith(`| ${id} `)) ?? "";
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const evaluationIds = [...(cells[1] ?? "").matchAll(/PROG-EVAL-[A-Z0-9-]+/g)].map((match) => match[0]);
    const ticketId = (cells[2] ?? "").match(/OBX-P\d{3}/)?.[0];
    if (evaluationIds.length === 0 || !ticketId) fail(`program traceability: ${id} row lacks evaluation or ticket`);
    for (const evaluationId of evaluationIds) {
      if (!evaluations.has(evaluationId)) fail(`program traceability: ${id} unknown evaluation ${evaluationId}`);
      else if (!(evaluations.get(evaluationId).requirements ?? []).includes(id)) fail(`program traceability: ${id} evaluation ${evaluationId} does not cover ${id}`);
    }
    if (ticketId && !tickets.has(ticketId)) fail(`program traceability: ${id} unknown ticket ${ticketId}`);
    else if (ticketId && !(tickets.get(ticketId).requirements ?? []).includes(id)) fail(`program traceability: ${id} ticket ${ticketId} does not own ${id}`);
  }
}

const ciWorkflow = readText(ciWorkflowPath);
if (ciWorkflow !== null) {
  for (const action of ["actions/checkout", "actions/setup-node"]) {
    const reference = ciWorkflow.match(new RegExp(`uses:\\s+${action.replace("/", "\\/")}@([^\\s#]+)`))?.[1];
    if (!/^[a-f0-9]{40}$/.test(reference ?? "")) fail(`ci workflow: ${action} must use a full commit SHA`);
  }
}

const frontDoorToken = authorityPath;
for (const path of ["AGENTS.md", "README.md"]) {
  const text = readText(path);
  if (text !== null && !text.includes(frontDoorToken)) fail(`${path}: missing authority-manifest front door`);
}
for (const path of ["docs/plans/one-box-master/README.md", "docs/plans/one-box-master/00-authority/plan-register.md"]) {
  const text = readText(path);
  if (text !== null && !text.includes("authority-manifest.json")) fail(`${path}: missing authority-manifest link`);
}

const linkPacket = new Set([
  "AGENTS.md",
  "README.md",
  "CONTRIBUTING.md",
  ...filesUnder("docs/plans/one-box-master").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/governance").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/tickets/one-box-program").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/eval/one-box-program").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/security").filter((path) => path.endsWith(".md")),
  ...filesUnder(".github").filter((path) => path.endsWith(".md")),
]);
for (const path of linkPacket) validateLocalLinks(path);

for (const path of [
  evalPath,
  ticketPath,
  ledgerPath,
  traceabilityPath,
  "docs/tickets/one-box-program/README.md",
  ticketBodyContractPath,
  requirementVocabularyPath,
  "docs/governance/reviewer-roles.md",
  "docs/eval/quarantine/README.md",
  "docs/governance/risk-exceptions/README.md",
  "CONTRIBUTING.md",
  "package.json",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  ciWorkflowPath,
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/feature.yml",
]) addDigest(path);

if (authority) {
  const canonicalAuthority = { ...authority };
  delete canonicalAuthority.packetDigest;
  digestInputs.set(`${authorityPath}#without-packetDigest`, Buffer.from(`${JSON.stringify(canonicalAuthority, null, 2)}\n`));
}

const digest = createHash("sha256");
for (const [path, bytes] of [...digestInputs].sort(([left], [right]) => left.localeCompare(right))) {
  digest.update(path);
  digest.update("\0");
  digest.update(bytes);
  digest.update("\0");
}
const packetDigest = digest.digest("hex");
if (authority && authority.packetDigest !== packetDigest) fail(`authority manifest: packetDigest mismatch; expected current ${packetDigest}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`Plan authority verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

if (!authority || !ticketManifest || !evalManifest || !adoptionLedger || Object.keys(authority.domains).length === 0 || tickets.size === 0 || evaluations.size === 0) {
  console.error("FAIL verifier reached an impossible empty success state");
  process.exit(1);
}

console.log(`Plan authority verification passed: ${Object.keys(authority.domains).length} domains, ${tickets.size} tickets, ${evaluations.size} program evaluations.`);
console.log(`Authority packet SHA-256: ${packetDigest}`);
