import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ARTIFACTS, RUN_FILE } from "./contracts";
import {
  addCost,
  createRun,
  createTemplateFallbackRun,
  ensureRun,
  failStage,
  LayoutAuthorityMismatchError,
  loadRun,
  readEvents,
  saveArtifact,
  saveRun,
  sitePaths,
  startStage,
  withRunTransaction,
} from "./runstate";

const runIds: string[] = [];
const fallbackClaimFile = ".template-fallback-claim.json";

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

async function makeRun(
  options: Parameters<typeof createRun>[0] = {},
): Promise<string> {
  const runId = await createRun(options);
  runIds.push(runId);
  return runId;
}

const intake = {
  businessName: "Authority Electric",
  category: "electrician",
  location: "Portland, OR",
  services: ["Panel upgrades"],
  primaryAction: "quote" as const,
  uploads: [],
};

describe("persisted layout authority", () => {
  it("defaults new and legacy records to template without rewriting a read", async () => {
    const runId = await makeRun();
    expect((await loadRun(runId)).layoutAuthority).toBe("template-v1");

    const runFile = path.join(sitePaths(runId).root, RUN_FILE);
    const raw = JSON.parse(await fs.readFile(runFile, "utf8")) as Record<string, unknown>;
    delete raw.layoutAuthority;
    await fs.writeFile(runFile, JSON.stringify(raw), "utf8");
    const before = await fs.readFile(runFile, "utf8");

    expect((await loadRun(runId)).layoutAuthority).toBe("template-v1");
    expect(await fs.readFile(runFile, "utf8")).toBe(before);
  });

  it("gates PageIR creation but resumes its persisted authority", async () => {
    const deniedId = "page-ir-denied";
    runIds.push(deniedId);
    await expect(
      createRun({ id: deniedId, layoutAuthority: "page-ir-v1" }),
    ).rejects.toThrow("requires explicit rollout permission");

    const runId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await expect(
      ensureRun(runId, { layoutAuthority: "page-ir-v1" }),
    ).resolves.toBe(runId);
    await expect(
      ensureRun(runId, { layoutAuthority: "template-v1" }),
    ).rejects.toThrow("layout authority does not match");
  });

  it("captures a new-run rollout decision and ignores later flag changes on resume", async () => {
    const runId = `rollout-capture-${process.pid}`;
    runIds.push(runId);
    const enabled = {
      schemaVersion: 1 as const,
      rolloutEnabled: true,
      killSwitchEngaged: false,
      layoutAuthority: "page-ir-v1" as const,
      reason: "rollout-enabled" as const,
    };
    await ensureRun(runId, { newRunRolloutDecision: enabled });
    const runPath = path.join(sitePaths(runId).root, RUN_FILE);
    const before = await fs.readFile(runPath);

    await expect(ensureRun(runId, {
      newRunRolloutDecision: {
        schemaVersion: 1,
        rolloutEnabled: true,
        killSwitchEngaged: true,
        layoutAuthority: "template-v1",
        reason: "kill-switch",
      },
    })).resolves.toBe(runId);

    expect(await fs.readFile(runPath)).toEqual(before);
    expect(await loadRun(runId)).toMatchObject({
      layoutAuthority: "page-ir-v1",
      rolloutDecision: enabled,
    });
  });

  it("rejects rollout-decision mutation and authority-decision mismatch", async () => {
    const runId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
      rolloutDecision: {
        schemaVersion: 1,
        rolloutEnabled: true,
        killSwitchEngaged: false,
        layoutAuthority: "page-ir-v1",
        reason: "rollout-enabled",
      },
    });
    const run = await loadRun(runId);
    await expect(saveRun({
      ...run,
      rolloutDecision: {
        schemaVersion: 1,
        rolloutEnabled: true,
        killSwitchEngaged: true,
        layoutAuthority: "template-v1",
        reason: "kill-switch",
      },
    })).rejects.toThrow(/rollout decision|layout authority/i);
    expect((await loadRun(runId)).rolloutDecision).toEqual(run.rolloutDecision);
  });

  it("rejects authority and fallback-origin changes at the storage boundary", async () => {
    const runId = await makeRun();
    const state = await loadRun(runId);
    await expect(
      saveRun({ ...state, layoutAuthority: "page-ir-v1" }),
    ).rejects.toThrow("layout authority is immutable");
    expect((await loadRun(runId)).layoutAuthority).toBe("template-v1");
  });

  it("serializes same-ID creation without overwriting the winner", async () => {
    const runId = `create-race-${process.pid}`;
    runIds.push(runId);
    const results = await Promise.allSettled([
      createRun({ id: runId, pipelineVersion: "legacy-v1", costCapUsd: 2 }),
      createRun({ id: runId, pipelineVersion: "evidence-gated-v2", costCapUsd: 9 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const persisted = await loadRun(runId);
    expect([
      ["legacy-v1", 2],
      ["evidence-gated-v2", 9],
    ]).toContainEqual([persisted.pipelineVersion, persisted.costCapUsd]);
  });

  it("keeps fallback origin off the public create and ensure surfaces", async () => {
    const origin = {
      sourceRunId: "source-run",
      reason: "candidate-gates-failed" as const,
      failure: { stage: "built" as const, message: "failed" },
    };
    const forgedId = `forged-child-${process.pid}`;
    runIds.push(forgedId);
    await expect(createRun({
      id: forgedId,
      // @ts-expect-error fallback origins are internal transaction provenance
      fallbackOrigin: origin,
    })).rejects.toThrow("fallbackOrigin is not a public run option");

    const ordinary = await makeRun();
    await expect(ensureRun(ordinary, {
      // @ts-expect-error fallback origins are internal transaction provenance
      fallbackOrigin: origin,
    })).rejects.toThrow("fallbackOrigin is not a public run option");
  });
});

describe("template fallback transaction", () => {
  it.each([
    ["missing", undefined, "template fallback source intake is missing"],
    [
      "invalid",
      { businessName: "Incomplete" },
      "template fallback source intake is invalid",
    ],
  ] as const)("leaves a failed source unlinked when intake is %s", async (
    _case,
    rawIntake,
    expectedMessage,
  ) => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    if (rawIntake !== undefined) {
      await saveArtifact(sourceRunId, ARTIFACTS.intake, rawIntake);
    }
    await failStage(sourceRunId, "built", "compiler failed");
    const before = await fs.readFile(
      path.join(sitePaths(sourceRunId).root, RUN_FILE),
      "utf8",
    );

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).rejects.toThrow(expectedMessage);
    const source = await loadRun(sourceRunId);
    if (source.templateFallback) runIds.push(source.templateFallback.childRunId);
    expect(source.templateFallback).toBeUndefined();
    expect(await fs.readFile(path.join(sitePaths(sourceRunId).root, RUN_FILE), "utf8"))
      .toBe(before);
    await expect(
      fs.stat(path.join(sitePaths(sourceRunId).root, fallbackClaimFile)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a template-authority source without changing run state", async () => {
    const sourceRunId = await makeRun();
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    const runPath = path.join(sitePaths(sourceRunId).root, RUN_FILE);
    const before = await fs.readFile(runPath);

    const error = await createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LayoutAuthorityMismatchError);
    expect(error).toMatchObject({
      message: "template fallback source requires page-ir-v1 authority; persisted run uses template-v1",
    });
    expect(await fs.readFile(runPath)).toEqual(before);
    expect((await loadRun(sourceRunId)).layoutAuthority).toBe("template-v1");
    await expect(fs.stat(path.join(sitePaths(sourceRunId).root, fallbackClaimFile)))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a Page IR source with no failed stage before creating a claim", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    const runPath = path.join(sitePaths(sourceRunId).root, RUN_FILE);
    const before = await fs.readFile(runPath);

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).rejects.toThrow("template fallback requires a currently failed stage");
    expect(await fs.readFile(runPath)).toEqual(before);
    expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();
    await expect(fs.stat(path.join(sitePaths(sourceRunId).root, fallbackClaimFile)))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a failed-then-restarted Page IR source before creating a claim", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    await startStage(sourceRunId, "built");
    const runPath = path.join(sitePaths(sourceRunId).root, RUN_FILE);
    const before = await fs.readFile(runPath);

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).rejects.toThrow("template fallback requires a currently failed stage");
    expect(await fs.readFile(runPath)).toEqual(before);
    expect((await loadRun(sourceRunId)).stages.built.status).toBe("running");
    expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();
    await expect(fs.stat(path.join(sitePaths(sourceRunId).root, fallbackClaimFile)))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("claims one child, snapshots long failures, clones only intake, and freezes the source", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
      pipelineVersion: "legacy-v1",
      referenceMode: "none",
      costCapUsd: 7,
      modelSlugs: { research: "frozen-model" },
      referencePickerEnabled: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await saveArtifact(sourceRunId, ARTIFACTS.pageIr, { prohibited: true });
    await saveArtifact(sourceRunId, ARTIFACTS.visualQa, { prohibited: true });
    await saveArtifact(sourceRunId, ARTIFACTS.gates, { prohibited: true });
    await saveArtifact(sourceRunId, ARTIFACTS.evidenceLedger, { prohibited: true });
    await fs.mkdir(path.join(sitePaths(sourceRunId).root, "candidate"), { recursive: true });
    await fs.writeFile(
      path.join(sitePaths(sourceRunId).root, "candidate", "provenance.json"),
      "prohibited",
    );
    await fs.mkdir(sitePaths(sourceRunId).site, { recursive: true });
    await fs.writeFile(path.join(sitePaths(sourceRunId).site, "index.html"), "old");
    await addCost(sourceRunId, 1.25);
    const failure = `  compiler exploded  ${"x".repeat(700)}  `;
    await failStage(sourceRunId, "built", failure);
    const before = await loadRun(sourceRunId);

    const childRunId = await createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
    );
    runIds.push(childRunId);
    const source = await loadRun(sourceRunId);
    const child = await loadRun(childRunId);

    expect(childRunId).not.toBe(sourceRunId);
    expect(source.templateFallback).toMatchObject({
      childRunId,
      reason: "page-ir-compilation-failed",
      failure: { stage: "built" },
    });
    expect(source.templateFallback?.failure.message).toHaveLength(500);
    expect(source.templateFallback?.failure.messageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect({ ...source, templateFallback: undefined }).toEqual(before);
    expect(child).toMatchObject({
      layoutAuthority: "template-v1",
      pipelineVersion: "legacy-v1",
      referenceMode: "none",
      costCapUsd: 7,
      modelSlugs: { research: "frozen-model" },
      referencePickerEnabled: true,
      fallbackOrigin: {
        sourceRunId,
        reason: "page-ir-compilation-failed",
        failure: source.templateFallback?.failure,
      },
      costUsd: 0,
    });
    expect(child.stages.intake.status).toBe("done");
    expect(child.stages.built.status).toBe("pending");
    expect(await readEvents(sourceRunId)).toContainEqual(
      expect.objectContaining({
        type: "fallback-created",
        stage: "built",
        sourceRunId,
        fallbackRunId: childRunId,
        reason: "page-ir-compilation-failed",
        failedStage: "built",
      }),
    );
    expect(await fs.readFile(path.join(sitePaths(childRunId).root, ARTIFACTS.intake), "utf8"))
      .toContain("Authority Electric");
    await expect(fs.stat(path.join(sitePaths(childRunId).root, ARTIFACTS.pageIr)))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(sitePaths(childRunId).site))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(sitePaths(childRunId).root, "candidate")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(sitePaths(childRunId).root, ARTIFACTS.visualQa)))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(sitePaths(childRunId).root, ARTIFACTS.gates)))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(sitePaths(childRunId).root, "evidence")))
      .rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).resolves.toBe(childRunId);
    expect((await readEvents(sourceRunId)).filter(
      (event) => event.type === "fallback-created",
    )).toHaveLength(1);
    await expect(
      createTemplateFallbackRun(sourceRunId, "candidate-gates-failed"),
    ).rejects.toThrow("reason conflicts");

    const terminalBytes = await fs.readFile(
      path.join(sitePaths(sourceRunId).root, RUN_FILE),
      "utf8",
    );
    await expect(startStage(sourceRunId, "built")).rejects.toThrow(
      "terminal and immutable",
    );
    await expect(withRunTransaction(sourceRunId, async ({ state }) => {
      state.costUsd += 0.1;
    })).rejects.toThrow("terminal and immutable");
    await expect(
      saveRun({ ...source, templateFallback: undefined }),
    ).rejects.toThrow("terminal and immutable");
    await expect(
      saveRun({ ...child, fallbackOrigin: undefined }),
    ).rejects.toThrow("fallback origin is immutable");
    await expect(
      saveRun({
        ...source,
        templateFallback: {
          ...source.templateFallback!,
          failure: {
            ...source.templateFallback!.failure,
            messageSha256: "f".repeat(64),
          },
        },
      }),
    ).rejects.toThrow("failure snapshot does not match");
    expect(await fs.readFile(path.join(sitePaths(sourceRunId).root, RUN_FILE), "utf8"))
      .toBe(terminalBytes);
  });

  it("concurrent fallback requests converge on one exact child", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "candidate gates failed");

    const children = await Promise.all([
      createTemplateFallbackRun(sourceRunId, "candidate-gates-failed"),
      createTemplateFallbackRun(sourceRunId, "candidate-gates-failed"),
    ]);
    expect(new Set(children)).toHaveLength(1);
    runIds.push(children[0]);
    expect((await loadRun(sourceRunId)).templateFallback?.childRunId).toBe(children[0]);
  });

  it("keeps every pre-link fault resumable and converges through the private claim", async () => {
    for (const boundary of [
      "afterClaim",
      "afterChildCreate",
      "afterUploadClone",
      "afterIntakeSave",
      "afterIntakeFinish",
    ] as const) {
      const sourceRunId = await makeRun({
        layoutAuthority: "page-ir-v1",
        pageIrRolloutPermitted: true,
      });
      await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
      await failStage(sourceRunId, "built", `failure at ${boundary}`);
      const sourceBeforeFault = await loadRun(sourceRunId);
      await expect(
        createTemplateFallbackRun(sourceRunId, "operator-requested-after-failure", {
          [boundary]: () => {
            throw new Error(`fault:${boundary}`);
          },
        }),
      ).rejects.toThrow(`fault:${boundary}`);
      const sourceAfterFault = await loadRun(sourceRunId);
      expect(sourceAfterFault.templateFallback).toBeUndefined();
      expect(sourceAfterFault).toEqual(sourceBeforeFault);
      const claim = JSON.parse(await fs.readFile(
        path.join(sitePaths(sourceRunId).root, fallbackClaimFile),
        "utf8",
      )) as { childRunId: string };
      const linkedChild = claim.childRunId;
      runIds.push(linkedChild);
      await expect(
        createTemplateFallbackRun(sourceRunId, "operator-requested-after-failure"),
      ).resolves.toBe(linkedChild);
      expect((await loadRun(linkedChild)).stages.intake.status).toBe("done");
    }
  });

  it("does not create a claim when a before-claim fault fires", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      { beforeClaim: () => { throw new Error("fault:beforeClaim"); } },
    )).rejects.toThrow("fault:beforeClaim");
    expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();
    await expect(
      fs.stat(path.join(sitePaths(sourceRunId).root, fallbackClaimFile)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed if a generic creator poisons the claimed child id", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    const sourceBefore = await loadRun(sourceRunId);
    let poisonedChildRunId = "";

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      {
        afterClaim: async () => {
          const claim = JSON.parse(await fs.readFile(
            path.join(sitePaths(sourceRunId).root, fallbackClaimFile),
            "utf8",
          )) as { childRunId: string };
          poisonedChildRunId = claim.childRunId;
          runIds.push(poisonedChildRunId);
          await createRun({ id: poisonedChildRunId });
        },
      },
    )).rejects.toThrow("existing fallback child does not match the durable claim");
    expect(poisonedChildRunId).not.toBe("");
    expect(await loadRun(sourceRunId)).toEqual(sourceBefore);
  });

  it("rejects a tampered private claim without terminalizing the source", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    const sourceBefore = await loadRun(sourceRunId);

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      { afterClaim: () => { throw new Error("fault:claim-created"); } },
    )).rejects.toThrow("fault:claim-created");
    const claimPath = path.join(sitePaths(sourceRunId).root, fallbackClaimFile);
    const claim = JSON.parse(await fs.readFile(claimPath, "utf8")) as {
      childRunId: string;
      origin: { reason: string };
    };
    runIds.push(claim.childRunId);
    claim.origin.reason = "candidate-gates-failed";
    await fs.writeFile(claimPath, JSON.stringify(claim), "utf8");

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).rejects.toThrow("claim conflicts with the failed source");
    expect(await loadRun(sourceRunId)).toEqual(sourceBefore);
  });

  it("recovers an origin-bearing orphan child from its durable claim", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    let claimedChildRunId = "";

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      {
        afterChildCreate: async () => {
          const claim = JSON.parse(await fs.readFile(
            path.join(sitePaths(sourceRunId).root, fallbackClaimFile),
            "utf8",
          )) as { childRunId: string };
          claimedChildRunId = claim.childRunId;
          throw new Error("fault:orphan-child");
        },
      },
    )).rejects.toThrow("fault:orphan-child");
    runIds.push(claimedChildRunId);
    expect((await loadRun(claimedChildRunId)).fallbackOrigin?.sourceRunId)
      .toBe(sourceRunId);
    expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).resolves.toBe(claimedChildRunId);
    expect((await loadRun(claimedChildRunId)).stages.intake.status).toBe("done");
  });

  it("does not link an origin-bearing child containing prohibited artifacts", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    let claimedChildRunId = "";

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      {
        afterChildCreate: async () => {
          const claim = JSON.parse(await fs.readFile(
            path.join(sitePaths(sourceRunId).root, fallbackClaimFile),
            "utf8",
          )) as { childRunId: string };
          claimedChildRunId = claim.childRunId;
          await saveArtifact(claimedChildRunId, ARTIFACTS.pageIr, { prohibited: true });
          await saveArtifact(claimedChildRunId, ARTIFACTS.gates, { prohibited: true });
          await saveArtifact(
            claimedChildRunId,
            ARTIFACTS.evidenceLedger,
            { prohibited: true },
          );
          throw new Error("fault:prohibited-child-artifact");
        },
      },
    )).rejects.toThrow("fault:prohibited-child-artifact");
    runIds.push(claimedChildRunId);

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).rejects.toThrow("fallback child contains prohibited artifacts");
    expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();
  });

  it("publishes the source link only after the exact child is complete", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    let childRunId = "";

    await expect(createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
      {
        afterIntakeFinish: async () => {
          expect((await loadRun(sourceRunId)).templateFallback).toBeUndefined();
          const claim = JSON.parse(await fs.readFile(
            path.join(sitePaths(sourceRunId).root, fallbackClaimFile),
            "utf8",
          )) as { childRunId: string };
          childRunId = claim.childRunId;
          const child = await loadRun(childRunId);
          expect(child.fallbackOrigin?.sourceRunId).toBe(sourceRunId);
          expect(child.stages.intake.status).toBe("done");
        },
        afterSourceLink: () => { throw new Error("fault:afterSourceLink"); },
      },
    )).rejects.toThrow("fault:afterSourceLink");
    runIds.push(childRunId);
    expect((await loadRun(sourceRunId)).templateFallback?.childRunId).toBe(childRunId);
    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).resolves.toBe(childRunId);
  });

  it("returns the linked child after its template pipeline has progressed", async () => {
    const sourceRunId = await makeRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
    await failStage(sourceRunId, "built", "compiler failed");
    const childRunId = await createTemplateFallbackRun(
      sourceRunId,
      "page-ir-compilation-failed",
    );
    runIds.push(childRunId);
    await startStage(childRunId, "scanned");
    await addCost(childRunId, 0.2);

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).resolves.toBe(childRunId);
  });
});
