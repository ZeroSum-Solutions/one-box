import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./[id]/route";
import { ARTIFACTS, IntakeSchema } from "../../../lib/contracts";
import { createRun, finishStage, saveArtifact, sitePaths, startStage } from "../../../lib/runstate";

const runIds: string[] = [];

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("guided pipeline route", () => {
  it("returns a no-store authenticated projection", async () => {
    const runId = await createRun();
    runIds.push(runId);
    await saveArtifact(
      runId,
      ARTIFACTS.intake,
      IntakeSchema.parse({
        businessName: "Route Test",
        category: "plumber",
        location: "Portland, OR",
        services: ["Repairs"],
        primaryAction: "quote",
      }),
    );
    const response = await GET(
      new Request(`http://localhost:3000/api/guided/${runId}`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ runId });
  });

  it("rejects unauthorized, malformed, and missing runs", async () => {
    const forbidden = await GET(
      new Request("http://evil.example/api/guided/run-1234", {
        headers: { Origin: "http://evil.example", Host: "localhost:3000" },
      }),
      context("run-1234"),
    );
    expect(forbidden.status).toBe(403);
    expect((await GET(
      new Request("http://localhost:3000/api/guided/bad!", {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context("bad!"),
    )).status).toBe(400);
    expect((await GET(
      new Request("http://localhost:3000/api/guided/missing-run", {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context("missing-run"),
    )).status).toBe(404);
  });

  it("fails closed when a completed stage has a corrupt required artifact", async () => {
    const runId = await createRun();
    runIds.push(runId);
    await saveArtifact(runId, ARTIFACTS.intake, IntakeSchema.parse({
      businessName: "Corrupt Route Test",
      category: "plumber",
      location: "Portland, OR",
      services: ["Repairs"],
      primaryAction: "quote",
    }));
    await startStage(runId, "intake");
    await finishStage(runId, "intake");
    await startStage(runId, "scanned");
    await finishStage(runId, "scanned");
    await fs.writeFile(`${sitePaths(runId).root}/${ARTIFACTS.scan}`, "{not-json");

    const response = await GET(
      new Request(`http://localhost:3000/api/guided/${runId}`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ surface: { kind: "state-unavailable" } });
  });
});
