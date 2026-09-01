import { isProxy } from "node:util/types";
import { canonicalSha256, computeSelfHash } from "./canonical";
import {
  arrayOf,
  booleanValue,
  closedEnum,
  closedRecord,
  literalValue,
  nonEmptyString,
  refine,
  withSelfHash,
  type InferValidator,
  type Validator,
} from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const COMMAND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const PAYLOAD_PATTERN = /^\/([a-z][a-z0-9-]{0,31})(?: (.+))?$/;
const UNSAFE_INPUT_PATTERN = /[\r\n`$();/\\<>|&=@]/;
const HUMAN_ACTOR_PATTERN = /^person:[a-z0-9][a-z0-9._-]{0,63}$/;
const PROHIBITED_EFFECTS = new Set([
  "mutate", "external-effect", "credential", "authority",
]);
const hashValue = refine(nonEmptyString(), (value) => HASH_PATTERN.test(value));
const humanActorId = refine(nonEmptyString(), (value) => HUMAN_ACTOR_PATTERN.test(value));
const utcTimestamp = refine(nonEmptyString(), (value) => {
  if (!UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value.replace("Z", ".000Z");
});
const uniqueStrings = refine(
  arrayOf(nonEmptyString()),
  (values) => values.length === new Set(values).size,
);
const uniqueHashes = refine(
  arrayOf(hashValue),
  (values) => values.length === new Set(values).size,
);
const RESERVED_NAME_POLICY = Object.freeze({
  schemaVersion: "slash-reserved-name-policy-v1", reservedNames: Object.freeze(["admin", "help"]),
});
const RESERVED_NAME_POLICY_HASH = canonicalSha256(RESERVED_NAME_POLICY);
const capabilities = refine(
  arrayOf(closedEnum(["read", "propose"] as const)),
  (values) => values.length === new Set(values).size,
);
const dataClasses = refine(
  arrayOf(closedEnum(["public", "internal"] as const)),
  (values) => values.length === new Set(values).size,
);
const skillAdmissionValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("skill-admission-v1"),
  skillId: nonEmptyString(),
  skillVersion: nonEmptyString(),
  displayName: nonEmptyString(),
  sourceIdentity: nonEmptyString(),
  sourceRevision: nonEmptyString(),
  packageHash: hashValue,
  instructionHash: hashValue,
  executableAssetHashes: uniqueHashes,
  inputSchemaHash: hashValue,
  outputSchemaHash: hashValue,
  allowedTaskClasses: uniqueStrings,
  requiredCapabilities: capabilities,
  requestedToolGrants: uniqueStrings,
  allowedDataClasses: dataClasses,
  contextPolicyHash: hashValue,
  budgetClassId: nonEmptyString(),
  compatibleRoutePolicyHashes: uniqueHashes,
  promptTemplateHashes: uniqueHashes,
  telemetryPolicyRef: nonEmptyString(),
  retentionPolicyRef: nonEmptyString(),
  provenanceAndLicenseRef: nonEmptyString(),
  killSwitchRef: nonEmptyString(),
  ownerAssignmentRefs: uniqueStrings,
  admission: literalValue("fixture-only"),
  effectiveAt: utcTimestamp,
  expiresAt: utcTimestamp,
  admissionHash: hashValue,
}), "admissionHash");
const commandEntryValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("slash-command-entry-v1"),
  commandName: refine(nonEmptyString(), (value) => COMMAND_PATTERN.test(value)),
  aliases: refine(
    arrayOf(refine(nonEmptyString(), (value) => COMMAND_PATTERN.test(value))),
    (values) => values.length === new Set(values).size,
  ),
  skillAdmissionHash: hashValue,
  inputSchemaHash: hashValue,
  helpText: nonEmptyString(),
  admission: literalValue("fixture-only"),
  killSwitchRef: nonEmptyString(),
  ownerAssignmentRefs: uniqueStrings,
  effectiveAt: utcTimestamp,
  expiresAt: utcTimestamp,
  commandHash: hashValue,
}), "commandHash");
const commandRegistryValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("slash-command-registry-v1"),
  commandHashes: uniqueHashes,
  reservedNames: uniqueStrings,
  reservedNamePolicyHash: hashValue,
  killSwitchRef: nonEmptyString(),
  ownerAssignmentRefs: uniqueStrings,
  effectiveAt: utcTimestamp,
  expiresAt: utcTimestamp,
  registryHash: hashValue,
}), "registryHash");
const catalogValidator = closedRecord({
  schemaVersion: literalValue("slash-command-catalog-v1"),
  registry: commandRegistryValidator,
  commands: arrayOf(commandEntryValidator),
  skills: arrayOf(skillAdmissionValidator),
});
const selectionEventValidator = closedRecord({
  schemaVersion: literalValue("slash-command-selection-event-v1"),
  invocationId: nonEmptyString(),
  actorId: humanActorId,
  authenticatedActorId: humanActorId,
  projectId: nonEmptyString(),
  jobId: nonEmptyString(),
  control: literalValue("explicit-command-control"),
  rawInput: nonEmptyString(),
  observedAt: utcTimestamp,
});
const liveGateValidator = closedRecord({
  schemaVersion: literalValue("skill-live-gate-v1"),
  authorizationCurrent: booleanValue(),
  currentOwnerAssignmentRefs: uniqueStrings,
  killedRefs: uniqueStrings,
});
const invocationValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("slash-command-invocation-v1"),
  invocationId: nonEmptyString(),
  actorId: humanActorId,
  projectId: nonEmptyString(),
  jobId: nonEmptyString(),
  commandRegistryHash: hashValue,
  commandHash: hashValue,
  skillAdmissionHash: hashValue,
  rawInputHash: hashValue,
  parsedInputHash: hashValue,
  createdAt: utcTimestamp,
  invocationHash: hashValue,
}), "invocationHash");
export type SkillAdmissionV1 = InferValidator<typeof skillAdmissionValidator>;
export type SlashCommandEntryV1 = InferValidator<typeof commandEntryValidator>;
export type SlashCommandRegistryV1 = InferValidator<typeof commandRegistryValidator>;
export type SlashCommandInvocationV1 = InferValidator<typeof invocationValidator>;
export type SlashCommandCatalogV1 = InferValidator<typeof catalogValidator>;
export type SkillPermissionLayerV1 = Readonly<{
  taskClasses?: readonly string[];
  tools?: readonly string[];
  dataClasses?: readonly ("public" | "internal")[];
  effects?: readonly ("read" | "propose")[];
}>;
export type EffectiveSkillPermissionV1 = Readonly<{
  taskClasses: readonly string[];
  tools: readonly string[];
  dataClasses: readonly ("public" | "internal")[];
  effects: readonly ("read" | "propose")[];
}>;
export type SlashCommandReductionV1 = Readonly<{
  disposition: "applied" | "attached";
  invocation: SlashCommandInvocationV1;
  skillAdmissionHash: string;
  input: string;
}>;
function catalogInvariant(catalog: SlashCommandCatalogV1): boolean {
  if (catalog.commands.length === 0 || catalog.skills.length === 0) return false;
  if (catalog.registry.ownerAssignmentRefs.length === 0) return false;
  if (catalog.registry.commandHashes.length !== catalog.commands.length) return false;
  if (!RESERVED_NAME_POLICY_HASH.ok
    || catalog.registry.reservedNamePolicyHash !== RESERVED_NAME_POLICY_HASH.value
    || catalog.registry.reservedNames.length !== RESERVED_NAME_POLICY.reservedNames.length
    || catalog.registry.reservedNames.some(
      (name, index) => name !== RESERVED_NAME_POLICY.reservedNames[index],
    )) return false;
  if (catalog.registry.commandHashes.some(
    (hash, index) => hash !== catalog.commands[index]?.commandHash,
  )) return false;
  const reserved = new Set(catalog.registry.reservedNames.map((name) => name.toLowerCase()));
  const names: string[] = [];
  for (const command of catalog.commands) {
    if (command.ownerAssignmentRefs.length === 0) return false;
    names.push(command.commandName, ...command.aliases);
    if ([command.commandName, ...command.aliases].some(
      (name) => reserved.has(name.toLowerCase()),
    )) return false;
    const skill = catalog.skills.find(
      (candidate) => candidate.admissionHash === command.skillAdmissionHash,
    );
    if (!skill || skill.inputSchemaHash !== command.inputSchemaHash) return false;
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return false;
  if (new Set(catalog.skills.map((skill) => skill.admissionHash)).size !== catalog.skills.length) {
    return false;
  }
  return catalog.skills.every((skill) => skill.ownerAssignmentRefs.length > 0
    && skill.executableAssetHashes.length === 0
    && skill.requestedToolGrants.length === 0);
}
export function validateSlashCommandCatalog(input: unknown): Result<SlashCommandCatalogV1> {
  const parsed = catalogValidator(input);
  if (!parsed.ok) return parsed;
  return catalogInvariant(parsed.value)
    ? success(parsed.value)
    : failure("INVARIANT_VIOLATION", []);
}
type NormalizedPermissionLayer = Readonly<{
  taskClasses: readonly string[];
  tools: readonly string[];
  dataClasses: readonly ("public" | "internal")[];
  effects: readonly ("read" | "propose")[];
}>;
const permissionKeys = ["taskClasses", "tools", "dataClasses", "effects"] as const;
const effectValidator = arrayOf(closedEnum([
  "read", "propose", "mutate", "external-effect", "credential", "authority",
] as const));
function permissionLayer(input: unknown, path: ContractPath = []): Result<NormalizedPermissionLayer> {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return failure("INVALID_RECORD", path);
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return failure("INVALID_RECORD", path);
    }
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string" || !permissionKeys.includes(key as never))) {
      return failure("UNKNOWN_FIELD", path);
    }
    const validators: Record<string, Validator<readonly string[]>> = {
      taskClasses: uniqueStrings,
      tools: uniqueStrings,
      dataClasses,
      effects: effectValidator,
    };
    const output: Record<string, readonly string[]> = {};
    for (const key of permissionKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor) {
        output[key] = Object.freeze([]);
        continue;
      }
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return failure("UNSUPPORTED_VALUE", [...path, key]);
      }
      const value = validators[key](descriptor.value, [...path, key]);
      if (!value.ok) return value;
      const prohibitedIndex = key === "effects"
        ? value.value.findIndex((effect) => PROHIBITED_EFFECTS.has(effect))
        : -1;
      if (prohibitedIndex >= 0) {
        return failure("UNSUPPORTED_VALUE", [...path, key, prohibitedIndex]);
      }
      output[key] = value.value;
    }
    return success(Object.freeze(output) as NormalizedPermissionLayer);
  } catch {
    return failure("UNSUPPORTED_VALUE", path);
  }
}
const permissionIntersectionValidator = closedRecord({
  authorization: permissionLayer,
  actorPolicy: permissionLayer,
  routePolicy: permissionLayer,
  skillRequest: permissionLayer,
  assignmentGrant: permissionLayer,
  toolPolicy: permissionLayer,
});
function intersect(values: readonly (readonly string[])[]): readonly string[] {
  const [first = [], ...rest] = values;
  return Object.freeze([...new Set(first)]
    .filter((value) => rest.every((items) => items.includes(value)))
    .sort());
}
export function intersectSkillPermissions(input: unknown): Result<EffectiveSkillPermissionV1> {
  const parsed = permissionIntersectionValidator(input);
  if (!parsed.ok) return parsed;
  const layers = Object.values(parsed.value);
  return success(Object.freeze({
    taskClasses: intersect(layers.map((layer) => layer.taskClasses)),
    tools: intersect(layers.map((layer) => layer.tools)),
    dataClasses: intersect(layers.map((layer) => layer.dataClasses)) as readonly ("public" | "internal")[],
    effects: intersect(layers.map((layer) => layer.effects)) as readonly ("read" | "propose")[],
  }));
}
function isLive(effectiveAt: string, expiresAt: string, observedAt: string): boolean {
  const observed = Date.parse(observedAt);
  return Date.parse(effectiveAt) <= observed && observed < Date.parse(expiresAt);
}
function isOwned(refs: readonly string[], current: ReadonlySet<string>): boolean {
  return refs.length > 0 && refs.some((ref) => current.has(ref));
}
function sealInvocation(
  value: Omit<SlashCommandInvocationV1, "invocationHash">,
): Result<SlashCommandInvocationV1> {
  const candidate = { ...value, invocationHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "invocationHash");
  return hash.ok ? invocationValidator({ ...candidate, invocationHash: hash.value }) : hash;
}
export function reduceSlashCommandSelection(
  catalogInput: unknown,
  eventInput: unknown,
  liveGateInput: unknown,
  priorInvocationInput: unknown | null,
): Result<SlashCommandReductionV1> {
  const catalog = validateSlashCommandCatalog(catalogInput);
  if (!catalog.ok) return catalog;
  const event = selectionEventValidator(eventInput);
  if (!event.ok) return event;
  const gate = liveGateValidator(liveGateInput);
  if (!gate.ok) return gate;
  if (event.value.actorId !== event.value.authenticatedActorId) {
    return failure("INVARIANT_VIOLATION", ["authenticatedActorId"]);
  }
  const killed = new Set(gate.value.killedRefs);
  const currentOwners = new Set(gate.value.currentOwnerAssignmentRefs);
  const registry = catalog.value.registry;
  if (!gate.value.authorizationCurrent || killed.has(registry.killSwitchRef)
    || !isOwned(registry.ownerAssignmentRefs, currentOwners)
    || !isLive(registry.effectiveAt, registry.expiresAt, event.value.observedAt)) {
    return failure("INVARIANT_VIOLATION", ["registry"]);
  }
  const match = event.value.rawInput.match(PAYLOAD_PATTERN);
  if (!match) return failure("UNSUPPORTED_VALUE", ["rawInput"]);
  const name = match[1];
  const input = match[2] ?? "";
  if (input.length > 0 && UNSAFE_INPUT_PATTERN.test(input)) {
    return failure("UNSUPPORTED_VALUE", ["rawInput"]);
  }
  const command = catalog.value.commands.find(
    (entry) => entry.commandName === name || entry.aliases.includes(name),
  );
  if (!command) return failure("UNSUPPORTED_VALUE", ["rawInput"]);
  const skill = catalog.value.skills.find(
    (entry) => entry.admissionHash === command.skillAdmissionHash,
  );
  if (!skill || killed.has(command.killSwitchRef) || killed.has(skill.killSwitchRef)
    || !isOwned(command.ownerAssignmentRefs, currentOwners)
    || !isOwned(skill.ownerAssignmentRefs, currentOwners)
    || !isLive(command.effectiveAt, command.expiresAt, event.value.observedAt)
    || !isLive(skill.effectiveAt, skill.expiresAt, event.value.observedAt)) {
    return failure("INVARIANT_VIOLATION", ["command"]);
  }
  const rawHash = canonicalSha256(event.value.rawInput);
  if (!rawHash.ok) return rawHash;
  const parsedHash = canonicalSha256({ commandName: command.commandName, input });
  if (!parsedHash.ok) return parsedHash;
  const invocation = sealInvocation({
    schemaVersion: "slash-command-invocation-v1",
    invocationId: event.value.invocationId,
    actorId: event.value.actorId,
    projectId: event.value.projectId,
    jobId: event.value.jobId,
    commandRegistryHash: registry.registryHash,
    commandHash: command.commandHash,
    skillAdmissionHash: skill.admissionHash,
    rawInputHash: rawHash.value,
    parsedInputHash: parsedHash.value,
    createdAt: event.value.observedAt,
  });
  if (!invocation.ok) return invocation;
  let disposition: SlashCommandReductionV1["disposition"] = "applied";
  if (priorInvocationInput !== null) {
    const prior = invocationValidator(priorInvocationInput);
    if (!prior.ok) return prior;
    if (prior.value.invocationId !== invocation.value.invocationId
      || prior.value.invocationHash !== invocation.value.invocationHash) {
      return failure("INVARIANT_VIOLATION", ["invocationId"]);
    }
    disposition = "attached";
  }
  return success(Object.freeze({
    disposition,
    invocation: invocation.value,
    skillAdmissionHash: skill.admissionHash,
    input,
  }));
}
