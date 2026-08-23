import fs from "node:fs/promises";
import { buildSite, type BuildSiteInput } from "../src/lib/builder";
import { ARTIFACTS, type SiteManifest } from "../src/lib/contracts";
import {
  candidatePaths,
  createRun,
  loadRun,
  RunNotFoundError,
  saveArtifact,
  sitePaths,
} from "../src/lib/runstate";

function assertFixtureRuntime(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("test-only builder fixture is disabled in production");
  }
  if (process.env.ONEBOX_TEST_FIXTURE_PUBLISH !== "1") {
    throw new Error(
      "test-only builder fixture requires explicit authorization",
    );
  }
}

interface FixturePublishDependencies {
  rename(from: string, to: string): Promise<void>;
}

const defaultFixturePublishDependencies: FixturePublishDependencies = {
  rename: fs.rename,
};

export async function publishBuildFixture(
  stagingDir: string,
  publishDir: string,
  dependencies: FixturePublishDependencies = defaultFixturePublishDependencies,
): Promise<void> {
  assertFixtureRuntime();
  const retired = `${publishDir}.retired-${process.pid}`;
  const hadPrevious = await fs.stat(publishDir).then(() => true).catch(() => false);
  if (hadPrevious) await dependencies.rename(publishDir, retired);
  try {
    await dependencies.rename(stagingDir, publishDir);
  } catch (publishError) {
    if (hadPrevious) {
      try {
        await dependencies.rename(retired, publishDir);
      } catch (restoreError) {
        throw new AggregateError(
          [publishError, restoreError],
          "fixture publication failed and the retired site could not be restored",
        );
      }
    }
    throw publishError;
  }
  if (hadPrevious) await fs.rm(retired, { recursive: true, force: true });
}

export async function buildAndPublishSiteFixture(
  input: BuildSiteInput,
): Promise<SiteManifest> {
  assertFixtureRuntime();
  try {
    await loadRun(input.runId);
  } catch (error) {
    if (!(error instanceof RunNotFoundError)) throw error;
    await createRun({ id: input.runId, pipelineVersion: "legacy-v1" });
  }
  await saveArtifact(input.runId, ARTIFACTS.intake, input.intake);
  await saveArtifact(input.runId, ARTIFACTS.tokens, input.tokens);
  await saveArtifact(input.runId, ARTIFACTS.skeleton, input.skeleton);
  await saveArtifact(input.runId, ARTIFACTS.copy, input.copy);
  if (input.tailwindThemeCss) {
    await saveArtifact(
      input.runId,
      ARTIFACTS.tailwindTheme,
      input.tailwindThemeCss,
      true,
    );
  }
  const manifest = await buildSite(input);
  const staging = `${sitePaths(input.runId).site}.fixture-${process.pid}-${Date.now()}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.cp(candidatePaths(input.runId).site, staging, { recursive: true });
  await publishBuildFixture(staging, sitePaths(input.runId).site);
  return manifest;
}
