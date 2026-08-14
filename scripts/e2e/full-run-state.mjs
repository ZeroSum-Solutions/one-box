import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function classifyPipelineEvents(events) {
  const terminal = [...events]
    .reverse()
    .find((event) =>
      ["error", "complete", "paused"].includes(event.type),
    );
  if (terminal?.type === "error") {
    return { status: "FAILED", event: terminal };
  }
  if (terminal?.type === "complete") {
    return { status: "COMPLETE", event: terminal };
  }
  if (terminal?.type === "paused") {
    return { status: "APPROVAL_REQUIRED", event: terminal };
  }

  return { status: "INCOMPLETE", event: null };
}

export async function computeSiteBuildSha256(siteDirectory) {
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(siteDirectory, absolute);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        hash.update(relative);
        hash.update("\0");
        hash.update(await fs.readFile(absolute));
        hash.update("\0");
      }
    }
  }
  await visit(siteDirectory);
  return hash.digest("hex");
}

const RUN_ID_PATTERN = /^[a-z0-9_-]{4,40}$/i;

export const REQUIRED_POST_EDIT_CHECKS = [
  "edit_site applies NL edit",
  "edited headline present in source",
  "gates re-ran after edit",
  "edit preserves all other data-edit-ids",
  "image edit swaps hero via Higgsfield",
  "generated image asset exists on disk",
  "preview reflects the edit",
  "no page errors in preview shell",
  "committed edits require renewed visual approval",
];

export function validateFinalizeCheckpoint(previous, runId) {
  const passedChecks = new Set(
    Array.isArray(previous?.results)
      ? previous.results
          .filter((result) => result?.pass === true)
          .map((result) => result.name)
      : [],
  );
  const proof = previous?.postEditProof;
  const valid =
    previous?.runId === runId &&
    previous?.status === "APPROVAL_REQUIRED" &&
    previous?.phase === "post-edit-review" &&
    previous?.terminal?.workflowStage === "build" &&
    typeof proof?.siteSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(proof.siteSha256) &&
    REQUIRED_POST_EDIT_CHECKS.every((name) => passedChecks.has(name));

  if (!valid) {
    throw new Error(
      "--finalize requires this run's recorded post-edit checks and build approval.",
    );
  }
  return proof;
}

export function shouldPreserveFinalizeCheckpoint(
  mode,
  status,
  hasValidatedCheckpoint,
) {
  return (
    mode === "finalize" &&
    status !== "COMPLETE" &&
    hasValidatedCheckpoint === true
  );
}

export function parseFullRunArguments(args) {
  let allowMetered = false;
  let mode = "new";
  let runId = null;
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    seen.add(argument);

    if (argument === "--allow-metered") {
      allowMetered = true;
      continue;
    }
    if (["--resume", "--reuse", "--finalize"].includes(argument)) {
      if (mode !== "new") {
        throw new Error("Choose only one run mode.");
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a runId.`);
      }
      if (!RUN_ID_PATTERN.test(value)) {
        throw new Error(`Invalid runId: ${value}`);
      }
      mode = argument.slice(2);
      runId = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!allowMetered) {
    throw new Error(
      "The live full-run requires explicit --allow-metered authorization.",
    );
  }
  return { allowMetered, mode, runId };
}

export function localJsonMutationHeaders(base) {
  return {
    "Content-Type": "application/json",
    Origin: new URL(base).origin,
    "Sec-Fetch-Site": "same-origin",
  };
}
