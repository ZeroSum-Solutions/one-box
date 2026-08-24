import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectSiteMotion,
  MotionDraftSchema,
  MotionManifestSchema,
  mutateSiteMotion,
  revertSiteMotion,
} from "./siteMotion";
import type { GateReport, MutationGateRequestV1 } from "./contracts";
import { knownMutationGateRequest } from "./mutationGateMatrix";

const roots: string[] = [];
const passGate = async (): Promise<GateReport[]> => [];

async function fixture(runId = "test-run") {
  const sitesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-motion-"));
  roots.push(sitesRoot);
  const root = path.join(sitesRoot, runId);
  await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(path.join(root, "site", "index.html"), '<main><h1 data-edit-id="hero.headline">Hello</h1><div data-edit-id="hero.webgl"><canvas></canvas></div></main>');
  await fs.writeFile(path.join(root, "gates.json"), "original gates");
  return { sitesRoot, root };
}

async function readOptional(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function snapshotArtifacts(root: string) {
  const relativePaths = [
    "site/motion.json",
    "site/motion-manifest.js",
    "motion-history.json",
    "gates.json",
  ];
  return new Map(
    await Promise.all(
      relativePaths.map(async (relativePath) => [
        relativePath,
        await readOptional(path.join(root, relativePath)),
      ] as const),
    ),
  );
}

async function expectArtifacts(root: string, expected: Map<string, Buffer | null>) {
  for (const [relativePath, bytes] of expected) {
    expect(await readOptional(path.join(root, relativePath))).toEqual(bytes);
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const draft = {
  editId: "hero.headline",
  kind: "entrance" as const,
  durationMs: 600,
  delayMs: 0,
  ease: "power2.out" as const,
  properties: { y: 24, opacity: 0 },
  trigger: "load" as const,
  replay: "once" as const,
  breakpoint: "all" as const,
};

describe("motion schema", () => {
  it("accepts each supported declarative kind", () => {
    expect(MotionDraftSchema.parse(draft).kind).toBe("entrance");
    expect(MotionDraftSchema.parse({ ...draft, kind: "exit", trigger: "manual" }).kind).toBe("exit");
    expect(MotionDraftSchema.parse({ ...draft, kind: "hover", trigger: "hover" }).kind).toBe("hover");
    expect(MotionDraftSchema.parse({ ...draft, kind: "scroll", trigger: "viewport", scrub: true }).kind).toBe("scroll");
    expect(MotionDraftSchema.parse({ ...draft, kind: "timeline", timelineId: "hero", order: 1 }).kind).toBe("timeline");
  });

  it("rejects selectors, code, unknown properties, and out-of-range values", () => {
    expect(MotionDraftSchema.safeParse({ ...draft, selector: "body" }).success).toBe(false);
    expect(MotionDraftSchema.safeParse({ ...draft, onComplete: "alert(1)" }).success).toBe(false);
    expect(MotionDraftSchema.safeParse({ ...draft, properties: { filter: "blur(2px)" } }).success).toBe(false);
    expect(MotionDraftSchema.safeParse({ ...draft, durationMs: 50_000 }).success).toBe(false);
    expect(MotionManifestSchema.safeParse({ version: 2, entries: [] }).success).toBe(false);
    expect(MotionDraftSchema.safeParse({ ...draft, trigger: "hover" }).success).toBe(false);
    expect(MotionDraftSchema.safeParse({ ...draft, kind: "timeline", trigger: "hover", timelineId: "hero", order: 1 }).success).toBe(false);
    expect(MotionManifestSchema.safeParse({ version: 1, entries: [{ ...draft, id: "00000000-0000-0000-0000-000000000000" }] }).success).toBe(false);
    const validEntry = { ...draft, id: "00000000-0000-4000-8000-000000000001" };
    expect(MotionManifestSchema.safeParse({ version: 1, entries: [validEntry, validEntry] }).success).toBe(false);
    expect(MotionManifestSchema.safeParse({
      version: 1,
      entries: [
        validEntry,
        { ...validEntry, id: "00000000-0000-4000-8000-000000000002" },
      ],
    }).success).toBe(false);
  });
});

describe("motion persistence", () => {
  it("routes apply, remove, and revert through the motion capability", async () => {
    const { sitesRoot } = await fixture();
    const requests: MutationGateRequestV1[] = [];
    const gateRunner = async (_runId: string, options: { afterEdit: MutationGateRequestV1 }): Promise<GateReport[]> => {
      requests.push(options.afterEdit);
      return [];
    };

    await mutateSiteMotion("test-run", { action: "apply", draft }, { sitesRoot, gateRunner });
    await mutateSiteMotion(
      "test-run",
      { action: "remove", editId: "hero.headline", kind: "entrance" },
      { sitesRoot, gateRunner },
    );
    await revertSiteMotion("test-run", { sitesRoot, gateRunner });

    expect(requests).toEqual([
      knownMutationGateRequest("motion"),
      knownMutationGateRequest("motion"),
      knownMutationGateRequest("motion"),
    ]);
  });

  it("keeps an injected-root apply and revert away from the default run root", async () => {
    const runId = "motion-injected-root";
    const defaultRunRoot = path.join(process.cwd(), "sites", runId);
    roots.push(defaultRunRoot);
    await fs.rm(defaultRunRoot, { recursive: true, force: true });
    const { sitesRoot } = await fixture(runId);

    await mutateSiteMotion(
      runId,
      { action: "apply", draft },
      { sitesRoot, gateRunner: passGate },
    );
    await revertSiteMotion(runId, { sitesRoot, gateRunner: passGate });

    expect((await inspectSiteMotion(runId, undefined, { sitesRoot })).entries).toEqual([]);
    await expect(fs.stat(defaultRunRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies, replaces, removes, and reverts through guarded history", async () => {
    const { sitesRoot } = await fixture();
    await mutateSiteMotion("test-run", { action: "apply", draft }, { sitesRoot, gateRunner: passGate });
    let inspected = await inspectSiteMotion("test-run", "hero.headline", { sitesRoot });
    expect(inspected.entries).toHaveLength(1);
    const manifestScript = await fs.readFile(
      path.join(sitesRoot, "test-run", "site", "motion-manifest.js"),
      "utf8",
    );
    expect(manifestScript).toMatch(/^window\.__ONEBOX_MOTION_MANIFEST__=/);
    expect(manifestScript).not.toContain("</script");
    expect(JSON.parse(manifestScript.slice(manifestScript.indexOf("=") + 1, -2))).toEqual(
      inspected.manifest,
    );
    await mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, durationMs: 900 } }, { sitesRoot, gateRunner: passGate });
    inspected = await inspectSiteMotion("test-run", "hero.headline", { sitesRoot });
    expect(inspected.entries).toHaveLength(1);
    expect(inspected.entries[0].durationMs).toBe(900);
    await mutateSiteMotion("test-run", { action: "remove", editId: "hero.headline", kind: "entrance" }, { sitesRoot, gateRunner: passGate });
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries).toHaveLength(0);
    await revertSiteMotion("test-run", { sitesRoot, gateRunner: passGate });
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries[0].durationMs).toBe(900);
  });

  it("keeps one timeline configuration per target when its group changes", async () => {
    const { sitesRoot } = await fixture();
    const firstTimeline = {
      ...draft,
      kind: "timeline" as const,
      timelineId: "hero-primary",
      order: 1,
    };
    await mutateSiteMotion("test-run", { action: "apply", draft: firstTimeline }, { sitesRoot, gateRunner: passGate });
    await mutateSiteMotion(
      "test-run",
      { action: "apply", draft: { ...firstTimeline, timelineId: "hero-secondary", order: 2 } },
      { sitesRoot, gateRunner: passGate },
    );

    const inspected = await inspectSiteMotion("test-run", "hero.headline", { sitesRoot });
    expect(inspected.entries).toHaveLength(1);
    expect(inspected.entries[0]).toMatchObject({
      kind: "timeline",
      timelineId: "hero-secondary",
      order: 2,
    });
  });

  it("rejects unknown and WebGL-owning targets", async () => {
    const { sitesRoot } = await fixture();
    await expect(mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, editId: "unknown.target" } }, { sitesRoot, gateRunner: passGate })).rejects.toThrow(/not found/);
    await expect(mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, editId: "hero.webgl" } }, { sitesRoot, gateRunner: passGate })).rejects.toThrow(/WebGL/);
  });

  it("restores exact motion artifacts and absent-before state after rejected gates", async () => {
    const { sitesRoot, root } = await fixture();
    await fs.writeFile(path.join(root, "site", "motion.json"), '{ "version": 1, "entries": [] }\n');
    await fs.writeFile(
      path.join(root, "site", "motion-manifest.js"),
      'window.__ONEBOX_MOTION_MANIFEST__={"version":1,"entries":[]};\n',
    );
    await fs.writeFile(
      path.join(root, "motion-history.json"),
      '{ "version": 1, "entries": [], "cursor": 0 }\n',
    );
    const presentBefore = await snapshotArtifacts(root);
    let gateCalls = 0;
    const failGate = async (): Promise<GateReport[]> => {
      gateCalls += 1;
      await fs.writeFile(path.join(root, "gates.json"), `candidate gates ${gateCalls}`);
      if (gateCalls > 1) throw new Error("restorative gate failed");
      return [{ gate: "motion-qa", pass: false, blocking: true, details: ["blocked"], ranAt: new Date().toISOString() }];
    };
    await expect(mutateSiteMotion("test-run", { action: "apply", draft }, { sitesRoot, gateRunner: failGate })).rejects.toThrow(/blocking gates/);
    await expectArtifacts(root, presentBefore);

    const absent = await fixture("motion-rejected-absent");
    const absentBefore = await snapshotArtifacts(absent.root);
    let absentGateCalls = 0;
    const rejectAbsent = async (): Promise<GateReport[]> => {
      absentGateCalls += 1;
      await fs.writeFile(path.join(absent.root, "gates.json"), `candidate gates ${absentGateCalls}`);
      if (absentGateCalls > 1) throw new Error("restorative gate failed");
      return [{ gate: "motion-qa", pass: false, blocking: true, details: ["blocked"], ranAt: new Date().toISOString() }];
    };
    await expect(
      mutateSiteMotion(
        "motion-rejected-absent",
        { action: "apply", draft },
        { sitesRoot: absent.sitesRoot, gateRunner: rejectAbsent },
      ),
    ).rejects.toThrow(/blocking gates/);
    await expectArtifacts(absent.root, absentBefore);
  });

  it("serializes concurrent apply operations without stale history", async () => {
    const { sitesRoot } = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const gateEntered = new Promise<void>((resolve) => { entered = resolve; });
    let calls = 0;
    const gateRunner = async (): Promise<GateReport[]> => {
      calls += 1;
      if (calls === 1) { entered(); await hold; }
      return [];
    };
    const first = mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, durationMs: 700 } }, { sitesRoot, gateRunner });
    await gateEntered;
    const second = mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, durationMs: 900 } }, { sitesRoot, gateRunner });
    release();
    await Promise.all([first, second]);
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries[0].durationMs).toBe(900);
    await revertSiteMotion("test-run", { sitesRoot, gateRunner: async () => [] });
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries[0].durationMs).toBe(700);
  });
});
