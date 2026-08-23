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
  loadRun,
  saveArtifact,
  saveRun,
  sitePaths,
  startStage,
} from "./runstate";

const runIds: string[] = [];

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
});

describe("template fallback transaction", () => {
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

    await expect(
      createTemplateFallbackRun(sourceRunId, "page-ir-compilation-failed"),
    ).resolves.toBe(childRunId);
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

  it("converges after faults at each committed boundary", async () => {
    for (const boundary of [
      "afterSourceClaim",
      "afterChildCreate",
      "afterUploadClone",
      "afterIntakeSave",
    ] as const) {
      const sourceRunId = await makeRun({
        layoutAuthority: "page-ir-v1",
        pageIrRolloutPermitted: true,
      });
      await saveArtifact(sourceRunId, ARTIFACTS.intake, intake);
      await failStage(sourceRunId, "built", `failure at ${boundary}`);
      await expect(
        createTemplateFallbackRun(sourceRunId, "operator-requested-after-failure", {
          [boundary]: () => {
            throw new Error(`fault:${boundary}`);
          },
        }),
      ).rejects.toThrow(`fault:${boundary}`);
      const linkedChild = (await loadRun(sourceRunId)).templateFallback!.childRunId;
      runIds.push(linkedChild);
      await expect(
        createTemplateFallbackRun(sourceRunId, "operator-requested-after-failure"),
      ).resolves.toBe(linkedChild);
      expect((await loadRun(linkedChild)).stages.intake.status).toBe("done");
    }
  });
});
