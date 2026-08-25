import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTokenEdit, inspectSiteTokens, inspectTokenSheet, revertTokenEdit, validateTokenValue } from "./siteTokens";
import type { GateReport, MutationGateRequestV1 } from "./contracts";
import { knownMutationGateRequest } from "./mutationGateMatrix";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

async function fixture(runId = "test-run") {
  const sitesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-tokens-")); roots.push(sitesRoot);
  const root = path.join(sitesRoot, runId); await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(path.join(root, "site", "tokens.css"), ":root { --color-primary: #112233; --color-primary-text: #445566; --space-md: 16px; }");
  await fs.writeFile(path.join(root, "site", "site.css"), ".hero, .btn:hover { color: var(--color-primary); padding: var(--space-md); }");
  await fs.writeFile(path.join(root, "site", "index.html"), '<main class="hero" data-edit-id="hero.section"><a class="btn" data-edit-id="hero.cta">Go</a></main>');
  await fs.writeFile(path.join(root, "gates.json"), "gates");
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
    "site/tokens.css",
    "tokens.json",
    "token-history.json",
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

describe("semantic token inspection and persistence", () => {
  it("routes token apply and revert through the token-style capability", async () => {
    const { sitesRoot } = await fixture();
    const requests: MutationGateRequestV1[] = [];
    const gateRunner = async (_runId: string, options: { afterEdit: MutationGateRequestV1 }): Promise<GateReport[]> => {
      requests.push(options.afterEdit);
      return [];
    };

    await applyTokenEdit("test-run", "--color-primary", "#abcdef", { sitesRoot, gateRunner });
    await revertTokenEdit("test-run", { sitesRoot, gateRunner });

    expect(requests).toEqual([
      knownMutationGateRequest("token-style"),
      knownMutationGateRequest("token-style"),
    ]);
  });

  it("keeps an injected-root apply and revert away from the default run root", async () => {
    const runId = "tokens-injected-root";
    const defaultRunRoot = path.join(process.cwd(), "sites", runId);
    roots.push(defaultRunRoot);
    await fs.rm(defaultRunRoot, { recursive: true, force: true });
    const { sitesRoot } = await fixture(runId);
    const gateRunner = async (): Promise<GateReport[]> => [];

    await applyTokenEdit(runId, "--color-primary", "#abcdef", { sitesRoot, gateRunner });
    await revertTokenEdit(runId, { sitesRoot, gateRunner });

    expect((await inspectSiteTokens(runId, { sitesRoot })).tokens.find(
      (token) => token.name === "--color-primary",
    )?.value).toBe("#112233");
    await expect(fs.stat(defaultRunRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

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
  it("restores exact token artifacts and absent-before state after rejected gates", async () => {
    const present = await fixture("tokens-rejected-present");
    await fs.writeFile(
      path.join(present.root, "tokens.json"),
      '{\n  "colors": [{ "cssVar": "--color-primary", "value": "#112233" }]\n}\n',
    );
    await fs.writeFile(
      path.join(present.root, "token-history.json"),
      '{ "version": 1, "entries": [], "cursor": 0 }\n',
    );
    const presentBefore = await snapshotArtifacts(present.root);
    let presentGateCalls = 0;
    const rejectPresent = async (): Promise<GateReport[]> => {
      presentGateCalls += 1;
      await fs.writeFile(path.join(present.root, "gates.json"), `candidate gates ${presentGateCalls}`);
      if (presentGateCalls > 1) throw new Error("restorative gate failed");
      return [{ gate: "token-qa", pass: false, blocking: true, details: ["blocked"], ranAt: new Date().toISOString() }];
    };
    await expect(
      applyTokenEdit("tokens-rejected-present", "--color-primary", "#abcdef", {
        sitesRoot: present.sitesRoot,
        gateRunner: rejectPresent,
      }),
    ).rejects.toThrow(/blocking gates/);
    await expectArtifacts(present.root, presentBefore);

    const absent = await fixture("tokens-rejected-absent");
    const absentBefore = await snapshotArtifacts(absent.root);
    let absentGateCalls = 0;
    const rejectAbsent = async (): Promise<GateReport[]> => {
      absentGateCalls += 1;
      await fs.writeFile(path.join(absent.root, "gates.json"), `candidate gates ${absentGateCalls}`);
      if (absentGateCalls > 1) throw new Error("restorative gate failed");
      return [{ gate: "token-qa", pass: false, blocking: true, details: ["blocked"], ranAt: new Date().toISOString() }];
    };
    await expect(
      applyTokenEdit("tokens-rejected-absent", "--color-primary", "#abcdef", {
        sitesRoot: absent.sitesRoot,
        gateRunner: rejectAbsent,
      }),
    ).rejects.toThrow(/blocking gates/);
    await expectArtifacts(absent.root, absentBefore);
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
