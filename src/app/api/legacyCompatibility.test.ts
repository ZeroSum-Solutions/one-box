import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET as GET_ASSETS } from "./assets/[id]/route";
import { GET as GET_EVIDENCE } from "./evidence/[id]/route";
import { GET as EXPORT_EVIDENCE } from "./evidence/[id]/export/route";
import { GET as GET_SITE } from "./sites/[id]/[...path]/route";
import { ARTIFACTS, IntakeSchema } from "../../lib/contracts";
import { createRun, saveArtifact, sitePaths } from "../../lib/runstate";

const LEGACY_MESSAGE =
  "Legacy/experimental and read-only in Phase 1; preview/export available; start a new Website project for generation/edit.";
const runIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

function authorizedRequest(url: string) {
  return new Request(url, {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
  });
}

async function snapshotTree(root: string) {
  const entries: Array<{
    path: string;
    type: "directory" | "file";
    mtimeMs: number;
    bytes?: string;
  }> = [];
  async function visit(directory: string) {
    for (const name of (await fs.readdir(directory)).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute);
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory", mtimeMs: stat.mtimeMs });
        await visit(absolute);
      } else if (stat.isFile()) {
        entries.push({
          path: relative,
          type: "file",
          mtimeMs: stat.mtimeMs,
          bytes: (await fs.readFile(absolute)).toString("base64"),
        });
      }
    }
  }
  await visit(root);
  return entries;
}

async function legacyFixture(projectTarget: "web-app" | "ios-app") {
  const runId = await createRun();
  runIds.push(runId);
  const roots = sitePaths(runId);
  await saveArtifact(
    runId,
    ARTIFACTS.intake,
    IntakeSchema.parse({
      businessName: "Legacy App",
      category: "service",
      location: "Austin, TX",
      services: ["Help"],
      primaryAction: "quote",
      projectTarget,
    }),
  );
  await fs.mkdir(path.join(roots.site, "assets"), { recursive: true });
  await fs.mkdir(path.join(roots.root, "evidence", "approved"), {
    recursive: true,
  });
  await fs.mkdir(path.join(roots.root, "evidence", "versions", "visual-qa"), {
    recursive: true,
  });
  await Promise.all([
    fs.writeFile(
      path.join(roots.site, "index.html"),
      '<!doctype html><html><head></head><body><img src="assets/hero.jpg"></body></html>',
    ),
    fs.writeFile(path.join(roots.site, "assets", "hero.jpg"), "legacy-image"),
    fs.writeFile(
      path.join(roots.site, "manifest.json"),
      JSON.stringify({
        entry: "index.html",
        files: ["index.html", "assets/hero.jpg"],
        assets: [{ path: "assets/hero.jpg", kind: "image" }],
        builtAt: "2026-08-01T00:00:00.000Z",
        complete: true,
      }),
    ),
    fs.writeFile(path.join(roots.root, "gates.json"), "[]\n"),
    fs.writeFile(
      path.join(roots.root, "image-library.json"),
      '{"version":1,"items":[]}\n',
    ),
    fs.writeFile(
      path.join(roots.root, "image-generation-ledger.json"),
      '{"version":1,"capCredits":14,"entries":[]}\n',
    ),
    fs.writeFile(
      path.join(roots.root, "evidence", "visual-qa.json"),
      '{"alias":"visual-qa"}\n',
    ),
    fs.writeFile(
      path.join(roots.root, "evidence", "approved", "visual-qa.json"),
      '{"alias":"approved-visual-qa"}\n',
    ),
    fs.writeFile(
      path.join(roots.root, "evidence", "versions", "visual-qa", "v1.json"),
      '{"version":1}\n',
    ),
  ]);
  return { runId, roots };
}

describe("legacy persisted-record compatibility", () => {
  it("exports an absent-metadata legacy non-Website run without mutating it", async () => {
    const { runId, roots } = await legacyFixture("web-app");
    const before = await snapshotTree(roots.root);

    await expect(
      fs.access(path.join(roots.site, ".one-box")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(roots.root, "candidate", "provenance.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const response = await EXPORT_EVIDENCE(
      authorizedRequest(`http://localhost:3000/api/evidence/${runId}/export`),
      { params: Promise.resolve({ id: runId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectTarget: "web-app",
      compatibility: {
        mode: "legacy-read-only",
        readOnly: true,
      },
    });
    expect(await snapshotTree(roots.root)).toEqual(before);
  });

  it.each(["web-app", "ios-app"] as const)(
    "keeps a %s record byte-for-byte read-only across asset view, preview, evidence, and export",
    async (projectTarget) => {
      const { runId, roots } = await legacyFixture(projectTarget);
      const before = await snapshotTree(roots.root);
      const context = { params: Promise.resolve({ id: runId }) };

      const assets = await GET_ASSETS(
        authorizedRequest(`http://localhost:3000/api/assets/${runId}`),
        context,
      );
      expect(assets.status).toBe(200);
      await expect(assets.json()).resolves.toMatchObject({
        compatibility: {
          mode: "legacy-read-only",
          projectTarget,
          label: "legacy/experimental",
          readOnly: true,
          message: LEGACY_MESSAGE,
        },
        library: { version: 1, items: [] },
      });

      const preview = await GET_SITE(
        new Request(`http://localhost:3000/api/sites/${runId}/index.html`),
        { params: Promise.resolve({ id: runId, path: ["index.html"] }) },
      );
      expect(preview.status).toBe(200);
      expect(await preview.text()).toContain('<img src="assets/hero.jpg">');

      const evidence = await GET_EVIDENCE(
        authorizedRequest(`http://localhost:3000/api/evidence/${runId}`),
        context,
      );
      expect(evidence.status).toBe(200);
      await expect(evidence.json()).resolves.toMatchObject({
        projectTarget,
        compatibility: {
          mode: "legacy-read-only",
          label: "legacy/experimental",
          readOnly: true,
          message: LEGACY_MESSAGE,
        },
      });

      const exported = await EXPORT_EVIDENCE(
        authorizedRequest(`http://localhost:3000/api/evidence/${runId}/export`),
        context,
      );
      expect(exported.status).toBe(200);
      expect(exported.headers.get("Content-Disposition")).toContain(
        `one-box-${runId}-evidence.json`,
      );
      expect(JSON.parse(await exported.text())).toMatchObject({
        projectTarget,
        compatibility: {
          mode: "legacy-read-only",
          label: "legacy/experimental",
          readOnly: true,
          message: LEGACY_MESSAGE,
        },
      });

      expect(await snapshotTree(roots.root)).toEqual(before);
    },
  );

  it("defaults only a missing historical projectTarget to Website compatibility", async () => {
    const runId = await createRun();
    runIds.push(runId);
    await saveArtifact(runId, ARTIFACTS.intake, {
      businessName: "Historical Website",
      category: "service",
      location: "Reno, NV",
      services: ["Installation"],
      primaryAction: "quote",
    });

    const response = await GET_EVIDENCE(
      authorizedRequest(`http://localhost:3000/api/evidence/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectTarget: "website",
      compatibility: {
        mode: "phase-1-website",
        projectTarget: "website",
        readOnly: false,
      },
    });
  });
});
