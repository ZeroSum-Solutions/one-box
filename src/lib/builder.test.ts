import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, deriveTextMuted, findDanglingTokenRefs } from "./builder";
import {
  buildAndPublishSiteFixture,
  publishBuildFixture,
} from "../../test-support/buildSiteFixture";
import { candidatePaths, createRun, sitePaths } from "./runstate";

describe("Website-only builds", () => {
  it.each(["web-app", "ios-app"] as const)(
    "rejects %s before creating a staging directory",
    async (projectTarget) => {
      const runId = `obx001-${projectTarget}`;
      const staging = path.join(process.cwd(), "sites", runId, "site.building");
      await fs.rm(path.dirname(staging), { recursive: true, force: true });

      await expect(
        buildSite({
          runId,
          intake: { projectTarget },
        } as Parameters<typeof buildSite>[0])
      ).rejects.toMatchObject({
        code: "unsupported-project-target",
        projectTarget,
      });
      await expect(fs.stat(staging)).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("fails closed before writing when durable run authorization is absent", async () => {
    const runId = `obx012-auth-${process.pid}`;
    const runRoot = path.join(process.cwd(), "sites", runId);
    await fs.rm(runRoot, { recursive: true, force: true });

    await expect(
      buildSite({
        runId,
        intake: { projectTarget: "website" },
      } as Parameters<typeof buildSite>[0])
    ).rejects.toThrow("durable run authorization is required");
    await expect(fs.stat(runRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["symbolic", "hard"] as const)(
    "rejects a %s-linked durable run authorization before candidate output",
    async (linkKind) => {
      const sourceRunId = `obx012-auth-src-${linkKind}-${process.pid}`;
      const runId = `obx012-auth-${linkKind}-${process.pid}`;
      const sourceRoot = sitePaths(sourceRunId).root;
      const runRoot = sitePaths(runId).root;
      await fs.rm(sourceRoot, { recursive: true, force: true });
      await fs.rm(runRoot, { recursive: true, force: true });
      try {
        await createRun({ id: sourceRunId, pipelineVersion: "legacy-v1" });
        await fs.mkdir(runRoot, { recursive: true });
        const sourceRunFile = path.join(sourceRoot, "run.json");
        const runFile = path.join(runRoot, "run.json");
        if (linkKind === "symbolic") {
          await fs.symlink(sourceRunFile, runFile);
        } else {
          await fs.link(sourceRunFile, runFile);
        }

        await expect(
          buildSite({
            runId,
            intake: { projectTarget: "website" },
          } as Parameters<typeof buildSite>[0]),
        ).rejects.toThrow(/regular non-linked file/);
        await expect(fs.stat(candidatePaths(runId).root)).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(await fs.readdir(runRoot)).toEqual(["run.json"]);
      } finally {
        await fs.rm(runRoot, { recursive: true, force: true });
        await fs.rm(sourceRoot, { recursive: true, force: true });
      }
    },
  );

  it("rejects durable authorization for a different run before candidate output", async () => {
    const runId = `obx012-auth-mismatch-${process.pid}`;
    const runRoot = sitePaths(runId).root;
    await fs.rm(runRoot, { recursive: true, force: true });
    try {
      await createRun({ id: runId, pipelineVersion: "legacy-v1" });
      const runFile = path.join(runRoot, "run.json");
      const persisted = JSON.parse(await fs.readFile(runFile, "utf8"));
      persisted.id = `other-${process.pid}`;
      await fs.writeFile(runFile, JSON.stringify(persisted, null, 2), "utf8");

      await expect(
        buildSite({
          runId,
          intake: { projectTarget: "website" },
        } as Parameters<typeof buildSite>[0]),
      ).rejects.toThrow(/does not match requested run/);
      await expect(fs.stat(candidatePaths(runId).root)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect((await fs.readdir(runRoot)).sort()).toEqual([
        ".run-state-lock",
        "run.json",
      ]);
    } finally {
      await fs.rm(runRoot, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "build and publish",
      () => buildAndPublishSiteFixture({} as Parameters<typeof buildSite>[0]),
    ],
    [
      "publish",
      () => publishBuildFixture("unused-staging", "unused-publish"),
    ],
  ])("requires explicit fixture authorization to %s", async (_label, invoke) => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ONEBOX_TEST_FIXTURE_PUBLISH", "");
    try {
      await expect(invoke()).rejects.toThrow(
        "test-only builder fixture requires explicit authorization",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    [
      "build and publish",
      () => buildAndPublishSiteFixture({} as Parameters<typeof buildSite>[0]),
    ],
    [
      "publish",
      () => publishBuildFixture("unused-staging", "unused-publish"),
    ],
  ])("makes the fixture %s helper unreachable in production", async (_label, invoke) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ONEBOX_TEST_FIXTURE_PUBLISH", "1");
    try {
      await expect(invoke()).rejects.toThrow(
        "test-only builder fixture is disabled in production",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ENG-008. A generated site shipped `--border-subtle: 1px solid
// var(--color-stone-grey)` against a --color-stone-grey that no token defined.
// The browser drops the whole declaration, the border vanishes, and the
// token-drift gate never sees it because that gate inspects colour and font
// only. These tests pin the check that would have caught it.
describe("findDanglingTokenRefs", () => {
  it("reports a var() reference no declaration defines", () => {
    expect(
      findDanglingTokenRefs([
        "  --color-border: #dddddd;",
        "  --border-subtle: 1px solid var(--color-stone-grey);",
      ])
    ).toEqual(["--color-stone-grey"]);
  });

  it("accepts a reference that resolves, whatever the declaration order", () => {
    expect(
      findDanglingTokenRefs([
        "  --border-subtle: 1px solid var(--color-border);",
        "  --color-border: #dddddd;",
      ])
    ).toEqual([]);
  });

  it("accepts a dangling reference that carries a fallback", () => {
    // var(--x, 1px) still renders when --x is missing, so it is not a defect.
    expect(
      findDanglingTokenRefs(["  --border-subtle: var(--color-nope, 1px) solid #ddd;"])
    ).toEqual([]);
  });

  it("reports every distinct dangling reference once", () => {
    expect(
      findDanglingTokenRefs([
        "  --shadow-card: 0 1px var(--space-nope) var(--color-nope);",
        "  --shadow-lifted: 0 2px var(--space-nope);",
      ])
    ).toEqual(["--color-nope", "--space-nope"]);
  });

  it("ignores a var() inside the declaration NAME position", () => {
    expect(findDanglingTokenRefs(["  --space-md: 16px;"])).toEqual([]);
  });
});

// ENG-005. The build used to write into the directory being served, so a
// rebuild dismantled the live site and a failed rebuild left it that way.
// Live runs PKcE4L_4j7Z1 / bC3CmmsckaUB failed the contrast gate on body copy.
// The template paints --color-text-muted as body text on bg and surface in
// eight places (.hero__sub, .card__body, .point__body, .area-chip, ...), but
// nothing checked that pairing: a reference-derived muted tone landed at
// 4.49:1 on bg — 0.01 under AA — and the whole build failed after the fact.
// derivePrimaryText/deriveOnSurfaceAlt already reconcile the palette against
// the template's fixed usage; this closes the one text role they missed.
describe("deriveTextMuted", () => {
  const ratio = (a: string, b: string): number => {
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const chan = (i: number) => {
        const v = parseInt(h.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("keeps a muted tone that already clears AA on both surfaces", () => {
    expect(
      deriveTextMuted({
        muted: "#5a5a5a",
        text: "#000000",
        bg: "#ffffff",
        surface: "#ffffff",
      })
    ).toBe("#5a5a5a");
  });

  it("darkens the 4.49:1 tone from run PKcE4L_4j7Z1 until it clears AA", () => {
    const result = deriveTextMuted({
      muted: "#895D2F",
      text: "#000000",
      bg: "#EBE3D4",
      surface: "#F7F2EC",
    });
    expect(ratio(result, "#EBE3D4")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(result, "#F7F2EC")).toBeGreaterThanOrEqual(4.5);
  });

  it("stays close to the reference hue instead of collapsing to the text color", () => {
    const result = deriveTextMuted({
      muted: "#895D2F",
      text: "#000000",
      bg: "#EBE3D4",
      surface: "#F7F2EC",
    });
    expect(result).not.toBe("#000000");
    const red = parseInt(result.slice(1, 3), 16);
    const blue = parseInt(result.slice(5, 7), 16);
    expect(red).toBeGreaterThan(blue); // still a warm brown, not a grey
  });

  it("lightens instead of darkening when the muted tone sits on a dark surface", () => {
    const result = deriveTextMuted({
      muted: "#3a3a3a",
      text: "#ffffff",
      bg: "#111111",
      surface: "#111111",
    });
    expect(ratio(result, "#111111")).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to the text color when no blend of the muted tone can clear AA", () => {
    expect(
      deriveTextMuted({
        muted: "#808080",
        text: "#ffffff",
        bg: "#7f7f7f",
        surface: "#7f7f7f",
      })
    ).toBe("#ffffff");
  });

  it("leaves a non-hex muted value untouched rather than guessing", () => {
    expect(
      deriveTextMuted({
        muted: "color-mix(in srgb, red, blue)",
        text: "#000000",
        bg: "#ffffff",
        surface: "#ffffff",
      })
    ).toBe("color-mix(in srgb, red, blue)");
  });
});

describe("publishBuildFixture", () => {
  const roots: string[] = [];
  beforeEach(() => vi.stubEnv("ONEBOX_TEST_FIXTURE_PUBLISH", "1"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      roots.splice(0).map((r) => fs.rm(r, { recursive: true, force: true })),
    );
  });

  async function staged(previous?: string) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-publish-"));
    roots.push(root);
    const publishDir = path.join(root, "site");
    const stagingDir = `${publishDir}.building`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, "index.html"), "new");
    if (previous !== undefined) {
      await fs.mkdir(publishDir, { recursive: true });
      await fs.writeFile(path.join(publishDir, "index.html"), previous);
      await fs.writeFile(path.join(publishDir, "stale.css"), "gone");
    }
    return { root, publishDir, stagingDir };
  }

  it("publishes a first build", async () => {
    const { publishDir, stagingDir } = await staged();
    await publishBuildFixture(stagingDir, publishDir);
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("new");
  });

  it("replaces a previous build without merging its files into the new one", async () => {
    // A plain copy-over would leave stale.css behind, still served and still
    // listed by nothing — the manifest would disagree with the directory.
    const { root, publishDir, stagingDir } = await staged("old");
    await publishBuildFixture(stagingDir, publishDir);
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("new");
    expect(await fs.readdir(publishDir)).toEqual(["index.html"]);
    expect(await fs.readdir(root)).toEqual(["site"]); // staging and retired both gone
  });

  it("leaves the previous build serving when the staged one never arrives", async () => {
    // The property the staging directory exists for: buildSite throws before
    // it ever calls publishBuildFixture, so the live site is untouched.
    const { publishDir } = await staged("old");
    await expect(publishBuildFixture(path.join(publishDir, "..", "nope"), publishDir)).rejects.toThrow();
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("old");
  });

  it("preserves the retired snapshot and reports both errors when publish and restore fail", async () => {
    const { publishDir, stagingDir } = await staged("old");
    const retired = `${publishDir}.retired-${process.pid}`;
    const publishError = new Error("staging rename failed");
    const restoreError = new Error("retired restore failed");
    const rename = vi.fn(async (from: string, to: string) => {
      if (from === stagingDir && to === publishDir) throw publishError;
      if (from === retired && to === publishDir) throw restoreError;
      await fs.rename(from, to);
    });

    let caught: unknown;
    try {
      await publishBuildFixture(stagingDir, publishDir, { rename });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      publishError,
      restoreError,
    ]);
    expect(await fs.readFile(path.join(retired, "index.html"), "utf8")).toBe(
      "old",
    );
    await expect(fs.stat(publishDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(stagingDir, "index.html"), "utf8")).toBe(
      "new",
    );
  });
});
