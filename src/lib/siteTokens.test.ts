import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTokenEdit, inspectSiteTokens, inspectTokenSheet, revertTokenEdit, validateTokenValue } from "./siteTokens";
import type { GateReport } from "./contracts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

async function fixture() {
  const sitesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-tokens-")); roots.push(sitesRoot);
  const root = path.join(sitesRoot, "test-run"); await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(path.join(root, "site", "tokens.css"), ":root { --color-primary: #112233; --color-primary-text: #445566; --space-md: 16px; }");
  await fs.writeFile(path.join(root, "site", "site.css"), ".hero, .btn:hover { color: var(--color-primary); padding: var(--space-md); }");
  await fs.writeFile(path.join(root, "site", "index.html"), '<main class="hero" data-edit-id="hero.section"><a class="btn" data-edit-id="hero.cta">Go</a></main>');
  await fs.writeFile(path.join(root, "gates.json"), "gates");
  return { sitesRoot, root };
}

describe("semantic token inspection and persistence", () => {
  it("reports usage scope and affected edit IDs", () => {
    const tokens = inspectTokenSheet(":root{--color-primary:#112233;}", ".hero,.btn:hover{color:var(--color-primary)}", '<main class="hero" data-edit-id="hero.section"><a class="btn" data-edit-id="hero.cta">Go</a></main>');
    expect(tokens[0].usageScope).toEqual([".hero", ".btn:hover"]);
    expect(tokens[0].affectedEditIds).toEqual(["hero.cta", "hero.section"]);
  });
  it("rejects unsafe CSS and derived-token edits", () => {
    const editable = { name: "--color-primary", semanticName: "color primary", value: "#112233", category: "color" as const, usageScope: [], affectedEditIds: [], editable: true };
    expect(() => validateTokenValue(editable, "url(https://evil)")).toThrow(/cannot contain/);
    expect(() => validateTokenValue({ ...editable, name: "--color-primary-text", editable: false }, "#ffffff")).toThrow(/read-only/);
  });
  it("applies and reverts with blocking gates", async () => {
    const { sitesRoot } = await fixture();
    const gateRunner = async (): Promise<GateReport[]> => [];
    await applyTokenEdit("test-run", "--color-primary", "#abcdef", { sitesRoot, gateRunner });
    expect((await inspectSiteTokens("test-run", { sitesRoot })).tokens.find((token) => token.name === "--color-primary")?.value).toBe("#abcdef");
    await revertTokenEdit("test-run", { sitesRoot, gateRunner });
    expect((await inspectSiteTokens("test-run", { sitesRoot })).tokens.find((token) => token.name === "--color-primary")?.value).toBe("#112233");
  });
  it("serializes concurrent edits so revert history keeps exact chronology", async () => {
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
    const first = applyTokenEdit("test-run", "--color-primary", "#223344", { sitesRoot, gateRunner });
    await gateEntered;
    const second = applyTokenEdit("test-run", "--color-primary", "#334455", { sitesRoot, gateRunner });
    release();
    await Promise.all([first, second]);
    expect((await inspectSiteTokens("test-run", { sitesRoot })).tokens.find((token) => token.name === "--color-primary")?.value).toBe("#334455");
    await revertTokenEdit("test-run", { sitesRoot, gateRunner: async () => [] });
    expect((await inspectSiteTokens("test-run", { sitesRoot })).tokens.find((token) => token.name === "--color-primary")?.value).toBe("#223344");
  });
});
