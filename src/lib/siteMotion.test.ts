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
import type { GateReport } from "./contracts";

const roots: string[] = [];
const passGate = async (): Promise<GateReport[]> => [];

async function fixture() {
  const sitesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-motion-"));
  roots.push(sitesRoot);
  const root = path.join(sitesRoot, "test-run");
  await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(path.join(root, "site", "index.html"), '<main><h1 data-edit-id="hero.headline">Hello</h1><div data-edit-id="hero.webgl"><canvas></canvas></div></main>');
  await fs.writeFile(path.join(root, "gates.json"), "original gates");
  return { sitesRoot, root };
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
  });
});

describe("motion persistence", () => {
  it("applies, replaces, removes, and reverts through guarded history", async () => {
    const { sitesRoot } = await fixture();
    await mutateSiteMotion("test-run", { action: "apply", draft }, { sitesRoot, gateRunner: passGate });
    let inspected = await inspectSiteMotion("test-run", "hero.headline", { sitesRoot });
    expect(inspected.entries).toHaveLength(1);
    await mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, durationMs: 900 } }, { sitesRoot, gateRunner: passGate });
    inspected = await inspectSiteMotion("test-run", "hero.headline", { sitesRoot });
    expect(inspected.entries).toHaveLength(1);
    expect(inspected.entries[0].durationMs).toBe(900);
    await mutateSiteMotion("test-run", { action: "remove", editId: "hero.headline", kind: "entrance" }, { sitesRoot, gateRunner: passGate });
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries).toHaveLength(0);
    await revertSiteMotion("test-run", { sitesRoot, gateRunner: passGate });
    expect((await inspectSiteMotion("test-run", "hero.headline", { sitesRoot })).entries[0].durationMs).toBe(900);
  });

  it("rejects unknown and WebGL-owning targets", async () => {
    const { sitesRoot } = await fixture();
    await expect(mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, editId: "unknown.target" } }, { sitesRoot, gateRunner: passGate })).rejects.toThrow(/not found/);
    await expect(mutateSiteMotion("test-run", { action: "apply", draft: { ...draft, editId: "hero.webgl" } }, { sitesRoot, gateRunner: passGate })).rejects.toThrow(/WebGL/);
  });

  it("rolls back manifest/history/gates when blocking gates fail", async () => {
    const { sitesRoot, root } = await fixture();
    let gateCalls = 0;
    const failGate = async () => {
      gateCalls += 1;
      await fs.writeFile(path.join(root, "gates.json"), "candidate gates");
      if (gateCalls > 1) throw new Error("restorative gate failed");
      return [{ gate: "motion-qa", pass: false, blocking: true, details: ["blocked"], ranAt: new Date().toISOString() }];
    };
    await expect(mutateSiteMotion("test-run", { action: "apply", draft }, { sitesRoot, gateRunner: failGate })).rejects.toThrow(/blocking gates/);
    expect((await inspectSiteMotion("test-run", undefined, { sitesRoot })).entries).toEqual([]);
    expect(await fs.readFile(path.join(root, "gates.json"), "utf8")).toBe("original gates");
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
