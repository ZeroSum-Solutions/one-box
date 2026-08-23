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
}

export async function publishBuildFixture(
  stagingDir: string,
  publishDir: string,
): Promise<void> {
  assertFixtureRuntime();
  const retired = `${publishDir}.retired-${process.pid}`;
  const hadPrevious = await fs.stat(publishDir).then(() => true).catch(() => false);
  if (hadPrevious) await fs.rename(publishDir, retired);
  try {
    await fs.rename(stagingDir, publishDir);
  } catch (error) {
    if (hadPrevious) await fs.rename(retired, publishDir).catch(() => {});
    throw error;
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
