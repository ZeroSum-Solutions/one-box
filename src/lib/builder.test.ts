import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findDanglingTokenRefs, publishBuild } from "./builder";

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
describe("publishBuild", () => {
  const roots: string[] = [];
  afterEach(async () =>
    Promise.all(roots.splice(0).map((r) => fs.rm(r, { recursive: true, force: true })))
  );

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
    await publishBuild(stagingDir, publishDir);
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("new");
  });

  it("replaces a previous build without merging its files into the new one", async () => {
    // A plain copy-over would leave stale.css behind, still served and still
    // listed by nothing — the manifest would disagree with the directory.
    const { root, publishDir, stagingDir } = await staged("old");
    await publishBuild(stagingDir, publishDir);
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("new");
    expect(await fs.readdir(publishDir)).toEqual(["index.html"]);
    expect(await fs.readdir(root)).toEqual(["site"]); // staging and retired both gone
  });

  it("leaves the previous build serving when the staged one never arrives", async () => {
    // The property the staging directory exists for: buildSite throws before
    // it ever calls publishBuild, so the live site is untouched.
    const { publishDir } = await staged("old");
    await expect(publishBuild(path.join(publishDir, "..", "nope"), publishDir)).rejects.toThrow();
    expect(await fs.readFile(path.join(publishDir, "index.html"), "utf8")).toBe("old");
  });
});
