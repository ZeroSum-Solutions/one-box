import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalSha256, computeSelfHash } from "./canonical";
import {
  intersectSkillPermissions,
  reduceSlashCommandSelection,
  validateSlashCommandCatalog,
} from "./skills";
const HASH = "a".repeat(64);
const OWNER_REF = "owner:fixture-current";
const OBSERVED_AT = "2026-09-01T00:00:00Z";
function seal<T extends Record<string, unknown>>(record: T, hashField: string): T {
  const candidate = { ...record, [hashField]: "0".repeat(64) };
  const hash = computeSelfHash(candidate, hashField);
  if (!hash.ok) throw new Error(`fixture hash failed: ${hash.reason}`);
  return { ...candidate, [hashField]: hash.value } as T;
}
function reservedPolicyHash(reservedNames: readonly string[]) {
  const hash = canonicalSha256({ schemaVersion: "slash-reserved-name-policy-v1", reservedNames });
  if (!hash.ok) throw new Error(`reserved policy hash failed: ${hash.reason}`);
  return hash.value;
}
function makeCatalog() {
  const skill = seal({
    schemaVersion: "skill-admission-v1",
    skillId: "fixture-draft",
    skillVersion: "1.0.0",
    displayName: "Fixture Draft",
    sourceIdentity: "synthetic/fixture-draft",
    sourceRevision: "fixture-revision-1",
    packageHash: "1".repeat(64),
    instructionHash: "2".repeat(64),
    executableAssetHashes: [],
    inputSchemaHash: "3".repeat(64),
    outputSchemaHash: "4".repeat(64),
    allowedTaskClasses: ["draft"],
    requiredCapabilities: ["propose"],
    requestedToolGrants: [],
    allowedDataClasses: ["public", "internal"],
    contextPolicyHash: "5".repeat(64),
    budgetClassId: "synthetic-budget",
    compatibleRoutePolicyHashes: ["6".repeat(64)],
    promptTemplateHashes: [],
    telemetryPolicyRef: "telemetry-denied-v1",
    retentionPolicyRef: "retention-none-v1",
    provenanceAndLicenseRef: "synthetic-fixture-v1",
    killSwitchRef: "kill:skill:fixture-draft",
    ownerAssignmentRefs: [OWNER_REF],
    admission: "fixture-only",
    effectiveAt: "2026-08-31T00:00:00Z",
    expiresAt: "2026-09-10T00:00:00Z",
    admissionHash: "0".repeat(64),
  }, "admissionHash");
  const command = seal({
    schemaVersion: "slash-command-entry-v1",
    commandName: "draft",
    aliases: ["compose"],
    skillAdmissionHash: skill.admissionHash,
    inputSchemaHash: skill.inputSchemaHash,
    helpText: "Create a synthetic proposal draft.",
    admission: "fixture-only",
    killSwitchRef: "kill:command:draft",
    ownerAssignmentRefs: [OWNER_REF],
    effectiveAt: "2026-08-31T00:00:00Z",
    expiresAt: "2026-09-10T00:00:00Z",
    commandHash: "0".repeat(64),
  }, "commandHash");
  const registry = seal({
    schemaVersion: "slash-command-registry-v1",
    commandHashes: [command.commandHash],
    reservedNames: ["admin", "help"],
    reservedNamePolicyHash: reservedPolicyHash(["admin", "help"]),
    killSwitchRef: "kill:registry:slash",
    ownerAssignmentRefs: [OWNER_REF],
    effectiveAt: "2026-08-31T00:00:00Z",
    expiresAt: "2026-09-10T00:00:00Z",
    registryHash: "0".repeat(64),
  }, "registryHash");
  return {
    schemaVersion: "slash-command-catalog-v1",
    registry,
    commands: [command],
    skills: [skill],
  };
}
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "slash-command-selection-event-v1",
    invocationId: "slash-invocation-1",
    actorId: "person:fixture-user",
    authenticatedActorId: "person:fixture-user",
    projectId: "one-box",
    jobId: "job-fixture-1",
    control: "explicit-command-control",
    rawInput: "/draft update the hero",
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}
function makeLiveGate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "skill-live-gate-v1",
    authorizationCurrent: true,
    currentOwnerAssignmentRefs: [OWNER_REF],
    killedRefs: [],
    ...overrides,
  };
}
function permissionInput(overrides: Record<string, unknown> = {}) {
  const layer = {
    taskClasses: ["draft", "review"],
    tools: ["artifact-read", "proposal-write"],
    dataClasses: ["public", "internal"],
    effects: ["read", "propose"],
  };
  return {
    authorization: layer,
    actorPolicy: layer,
    routePolicy: layer,
    skillRequest: layer,
    assignmentGrant: layer,
    toolPolicy: layer,
    ...overrides,
  };
}
describe("skill permission intersection", () => {
  it("intersects all six layers deterministically", () => {
    const result = intersectSkillPermissions(permissionInput({
      assignmentGrant: {
        taskClasses: ["draft"],
        tools: ["proposal-write"],
        dataClasses: ["public"],
        effects: ["propose"],
      },
    }));
    expect(result).toEqual({
      ok: true,
      value: {
        taskClasses: ["draft"],
        tools: ["proposal-write"],
        dataClasses: ["public"],
        effects: ["propose"],
      },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.tools)).toBe(true);
    }
  });
  it("treats an omitted permission dimension as empty", () => {
    const result = intersectSkillPermissions(permissionInput({
      toolPolicy: { taskClasses: ["draft"], dataClasses: ["public"], effects: ["read"] },
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tools).toEqual([]);
  });
  it.each(["mutate", "external-effect", "credential", "authority"])(
    "denies the prohibited %s effect even when another layer would remove it",
    (effect) => {
      const result = intersectSkillPermissions(permissionInput({
        authorization: {
          taskClasses: ["draft"],
          tools: [],
          dataClasses: ["public"],
          effects: [effect],
        },
      }));
      expect(result.ok).toBe(false);
    },
  );
  it("rejects unknown permission fields and duplicate grants", () => {
    const unknown = permissionInput({
      routePolicy: { tools: [], authority: ["approve"] },
    });
    const duplicate = permissionInput({
      routePolicy: { tools: ["artifact-read", "artifact-read"] },
    });
    expect(intersectSkillPermissions(unknown).ok).toBe(false);
    expect(intersectSkillPermissions(duplicate).ok).toBe(false);
  });
});
describe("slash command catalog", () => {
  it("accepts the exact offline catalog and deeply freezes it", () => {
    const result = validateSlashCommandCatalog(makeCatalog());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.commands)).toBe(true);
    expect(Object.isFrozen(result.value.skills[0])).toBe(true);
  });
  it("rejects reserved names and case-folded collisions before selection", () => {
    const reserved = makeCatalog();
    reserved.commands[0] = seal({
      ...reserved.commands[0],
      commandName: "help",
    }, "commandHash");
    reserved.registry = seal({
      ...reserved.registry,
      commandHashes: [reserved.commands[0].commandHash],
    }, "registryHash");
    const duplicate = makeCatalog();
    duplicate.commands[0] = seal({
      ...duplicate.commands[0],
      aliases: ["draft"],
    }, "commandHash");
    duplicate.registry = seal({
      ...duplicate.registry,
      commandHashes: [duplicate.commands[0].commandHash],
    }, "registryHash");
    expect(validateSlashCommandCatalog(reserved).ok).toBe(false);
    expect(validateSlashCommandCatalog(duplicate).ok).toBe(false);
  });
  it("rejects a caller-redefined reserved-name policy even when self-consistent", () => {
    const catalog = makeCatalog();
    catalog.registry = seal({
      ...catalog.registry,
      reservedNames: ["custom"],
      reservedNamePolicyHash: reservedPolicyHash(["custom"]),
    }, "registryHash");
    expect(validateSlashCommandCatalog(catalog).ok).toBe(false);
  });
  it("rejects runtime assets, requested tools, enabled admission, and unknown fields", () => {
    for (const patch of [
      { executableAssetHashes: [HASH] },
      { requestedToolGrants: ["shell"] },
      { admission: "enabled" },
      { runtimeUrl: "https://example.invalid" },
    ]) {
      const catalog = makeCatalog();
      const changedSkill = seal({
        ...catalog.skills[0], ...patch,
      } as Record<string, unknown>, "admissionHash");
      expect(validateSlashCommandCatalog({ ...catalog, skills: [changedSkill] }).ok).toBe(false);
    }
  });
});
describe("explicit slash command selection", () => {
  it("parses one full payload into a non-dispatching selection draft", () => {
    const result = reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent(),
      makeLiveGate(),
      null,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.disposition).toBe("applied");
    expect(result.value.input).toBe("update the hero");
    expect(result.value.skillAdmissionHash).toBe(makeCatalog().skills[0].admissionHash);
    expect(result.value.invocation).toMatchObject({
      schemaVersion: "slash-command-invocation-v1",
      invocationId: "slash-invocation-1",
      actorId: "person:fixture-user",
      projectId: "one-box",
      jobId: "job-fixture-1",
    });
    expect(result.value.invocation.invocationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.value).not.toHaveProperty("dispatch");
    expect(result.value).not.toHaveProperty("runtime");
    expect(Object.isFrozen(result.value.invocation)).toBe(true);
  });
  it("requires the authenticated actor and explicit command control", () => {
    expect(reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ authenticatedActorId: "person:someone-else" }),
      makeLiveGate(),
      null,
    ).ok).toBe(false);
    expect(reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ control: "pasted-text" }),
      makeLiveGate(),
      null,
    ).ok).toBe(false);
  });
  it.each(["model:fixture", "skill:fixture", "provider:fixture", "worker:fixture"])(
    "rejects non-human explicit actor identity %s",
    (actorId) => {
      expect(reduceSlashCommandSelection(
        makeCatalog(), makeEvent({ actorId, authenticatedActorId: actorId }), makeLiveGate(), null,
      ).ok).toBe(false);
    },
  );
  it.each([
    "draft update the hero",
    "//draft update",
    "/Draft update",
    "/draft ",
    "/draft first\n/draft second",
    "/draft `touch x`",
    "/draft $(touch x)",
    "/draft a;b",
    "/draft ../../secret",
    "/draft https://example.invalid",
    "/draft plugin@latest",
    "/draft NAME=value",
  ])("rejects the non-grammar or executable-shaped payload %j", (rawInput) => {
    expect(reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ rawInput }),
      makeLiveGate(),
      null,
    ).ok).toBe(false);
  });
  it("checks authorization, owner, kill, effective, and expiry gates", () => {
    const cases = [
      makeLiveGate({ authorizationCurrent: false }),
      makeLiveGate({ currentOwnerAssignmentRefs: [] }),
      makeLiveGate({ killedRefs: ["kill:registry:slash"] }),
      makeLiveGate({ killedRefs: ["kill:command:draft"] }),
      makeLiveGate({ killedRefs: ["kill:skill:fixture-draft"] }),
    ];
    for (const liveGate of cases) {
      expect(reduceSlashCommandSelection(
        makeCatalog(), makeEvent(), liveGate, null,
      ).ok).toBe(false);
    }
    expect(reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ observedAt: "2026-08-30T00:00:00Z" }),
      makeLiveGate(),
      null,
    ).ok).toBe(false);
    expect(reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ observedAt: "2026-09-10T00:00:00Z" }),
      makeLiveGate(),
      null,
    ).ok).toBe(false);
  });
  it("attaches an exact replay and rejects a conflicting invocation replay", () => {
    const first = reduceSlashCommandSelection(
      makeCatalog(), makeEvent(), makeLiveGate(), null,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = reduceSlashCommandSelection(
      makeCatalog(), makeEvent(), makeLiveGate(), first.value.invocation,
    );
    const conflict = reduceSlashCommandSelection(
      makeCatalog(),
      makeEvent({ rawInput: "/draft different" }),
      makeLiveGate(),
      first.value.invocation,
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.disposition).toBe("attached");
      expect(replay.value.invocation).toEqual(first.value.invocation);
    }
    expect(conflict.ok).toBe(false);
  });
  it("rejects unknown request and live-gate fields", () => {
    expect(reduceSlashCommandSelection(
      makeCatalog(), makeEvent({ provider: "live" }), makeLiveGate(), null,
    ).ok).toBe(false);
    expect(reduceSlashCommandSelection(
      makeCatalog(), makeEvent(), makeLiveGate({ network: true }), null,
    ).ok).toBe(false);
  });
});
describe("skills module architecture", () => {
  it("keeps a closed source-only API below 400 lines", () => {
    const source = readFileSync(new URL("./skills.ts", import.meta.url), "utf8");
    const exportedNames = [...source.matchAll(
      /^export (?:function|type) (\w+)/gm,
    )].map((match) => match[1]);
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:(?:fs|child_process|http|https|net|tls)/);
    expect(source).not.toMatch(/\b(?:fetch|WebSocket|process\.env|dispatch|exec|spawn)\b/);
    expect(exportedNames).toEqual([
      "SkillAdmissionV1",
      "SlashCommandEntryV1",
      "SlashCommandRegistryV1",
      "SlashCommandInvocationV1",
      "SlashCommandCatalogV1",
      "SkillPermissionLayerV1",
      "EffectiveSkillPermissionV1",
      "SlashCommandReductionV1",
      "validateSlashCommandCatalog",
      "intersectSkillPermissions",
      "reduceSlashCommandSelection",
    ]);
  });
});
