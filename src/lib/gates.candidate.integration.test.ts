import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  candidateManifestSha256,
  createCandidateManifest,
  transitionCandidateProvenance,
} from "./candidate";
import { CandidateProvenanceV1Schema } from "./contracts";
import { runCandidateGates } from "./gates";
import { candidatePaths, sitePaths } from "./runstate";

const runIds: string[] = [];

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(filePath: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(JSON.stringify(value, null, 2));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return bytes;
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("candidate gates real browser", () => {
  it(
    "runs the actual complete gate suite directly against an unserved candidate",
    { timeout: 30_000 },
    async () => {
      const runId = `candidate-real-${process.pid}`;
      runIds.push(runId);
      const paths = candidatePaths(runId);
      await fs.mkdir(paths.site, { recursive: true });
      await fs.writeFile(
        path.join(paths.site, "index.html"),
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Candidate fixture</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="site.css"></head><body><nav aria-label="Main navigation"><a href="#contact">Contact</a></nav><main><section><h1 data-edit-id="hero.headline">Candidate fixture</h1><p>Readable candidate body copy.</p></section><section id="contact"><h2>Contact</h2><a data-edit-id="contact.cta" href="tel:5550100">Call 555-0100</a></section></main></body></html>',
      );
      await fs.writeFile(
        path.join(paths.site, "tokens.css"),
        ":root { --color-bg: #ffffff; --color-text: #111111; --font-body: Arial, sans-serif; }\n",
      );
      await fs.writeFile(
        path.join(paths.site, "site.css"),
        "* { box-sizing: border-box; color: var(--color-text); font-family: var(--font-body); } body { margin: 0; background: var(--color-bg); } nav, main, section { display: block; padding: 1rem; } a { display: inline-block; }\n",
      );

      const tokenBytes = await writeJson(
        path.join(sitePaths(runId).root, "tokens.json"),
        {
          colors: [
            { name: "Canvas", value: "#ffffff", cssVar: "--color-bg", role: "page" },
            { name: "Ink", value: "#111111", cssVar: "--color-text", role: "text" },
          ],
          fonts: [
            { family: "Arial", cssVar: "--font-body", weights: [400, 700], role: "body" },
          ],
          typeScale: [],
          radii: {},
          spacing: {},
          layout: { maxWidthPx: 1200, sectionGapPx: 64, cardPaddingPx: 24 },
          motion: {
            easing: "linear",
            durationMs: { micro: 100, reveal: 200 },
            revealClasses: [],
          },
          componentStates: [],
          imageryBrief: {
            subject: "none",
            lighting: "none",
            grade: "none",
            framing: "none",
            avoid: [],
          },
        },
      );
      const intakeBytes = await writeJson(
        path.join(sitePaths(runId).root, "intake.json"),
        {
          businessName: "Candidate Co",
          category: "service",
          location: "Portland, OR",
          services: ["Service"],
          phone: "555-0100",
          primaryAction: "call",
        },
      );
      const manifest = await createCandidateManifest(paths.site);
      await writeJson(paths.manifest, manifest);
      const preparing = CandidateProvenanceV1Schema.parse({
        schemaVersion: 1,
        candidateId: "candidate-v1",
        runId,
        createdAt: "2026-08-22T00:00:00.000Z",
        state: "preparing",
        history: [
          { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
        ],
        inputArtifactHashes: [
          { path: "intake.json", sha256: sha256(intakeBytes) },
          { path: "tokens.json", sha256: sha256(tokenBytes) },
        ],
        layoutAuthority: "template-v1",
        compilerVersion: "template-compiler@1",
      });
      await writeJson(
        paths.provenance,
        transitionCandidateProvenance(
          preparing,
          "ready-for-gates",
          "2026-08-22T00:00:01.000Z",
          {
            candidateManifestSha256: candidateManifestSha256(manifest),
            buildSha256: manifest.buildSha256,
          },
        ),
      );
      const liveBytes = Buffer.from("live-site-must-not-be-loaded");
      const liveGateBytes = Buffer.from("live-gates-must-not-change");
      await fs.mkdir(sitePaths(runId).site, { recursive: true });
      await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), liveBytes);
      await fs.writeFile(path.join(sitePaths(runId).root, "gates.json"), liveGateBytes);

      const result = await runCandidateGates(runId);
      const receiptBytes = await fs.readFile(paths.gates);
      const manifestHash = candidateManifestSha256(manifest);

      expect(result.receipt.reports.map((report) => report.gate)).toEqual([
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "console-errors",
        "assets",
        "no-js",
        "mobile-layout",
        "perf-budget",
      ]);
      expect(
        result.receipt.reports.filter((report) => report.blocking && !report.pass),
      ).toEqual([]);
      expect(result.receipt).toMatchObject({
        schemaVersion: 1,
        runId,
        candidateManifestSha256: manifestHash,
        buildSha256: manifest.buildSha256,
      });
      expect(receiptBytes).toEqual(
        Buffer.from(JSON.stringify(result.receipt, null, 2)),
      );
      expect(await fs.readFile(path.join(sitePaths(runId).site, "index.html"))).toEqual(
        liveBytes,
      );
      expect(await fs.readFile(path.join(sitePaths(runId).root, "gates.json"))).toEqual(
        liveGateBytes,
      );
      expect(result.gateReportSha256).toBe(sha256(receiptBytes));
    },
  );
});
