import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ElementEditError,
  applyElementPatchToHtml,
  applyElementHtmlEdit,
  applyStructuredElementEdit,
  elementHistoryState,
  elementTree,
  moveElementHistory,
} from "./elementEditor";
import { BlockingMutationError, type GateRunner } from "./siteMutation";
import {
  knownMutationGateRequest,
  mixedMutationGateRequest,
  unknownMutationGateRequest,
} from "./mutationGateMatrix";
import type { MutationGateRequestV1 } from "./contracts";

const temporaryRoots: string[] = [];
const passGate: GateRunner = async () => [
  {
    gate: "test",
    pass: true,
    blocking: true,
    details: [],
    ranAt: new Date().toISOString(),
  },
];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(runId = "test-run") {
  const sitesRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onebox-elements-"),
  );
  temporaryRoots.push(sitesRoot);
  const siteDir = path.join(sitesRoot, runId, "site");
  await fs.mkdir(siteDir, { recursive: true });
  const html =
    '<!doctype html><html><body><main><h1 data-edit-id="hero.headline">Original</h1><a data-edit-id="hero.cta" href="#contact">Call us</a><button data-edit-id="hero.button">More</button><section id="contact">Contact</section></main></body></html>';
  await fs.writeFile(path.join(siteDir, "index.html"), html);
  return { sitesRoot, siteDir, html };
}

describe("structured element patch", () => {
  it("persists text as escaped text and maps typography to allowlisted token values", () => {
    const html = applyElementPatchToHtml(
      '<html><body><h1 data-edit-id="hero.headline">Old</h1></body></html>',
      "hero.headline",
      {
        text: "New <safe>",
        typography: {
          fontFamily: "display",
          fontSize: "heading-lg",
          color: "accent",
          alignment: "center",
        },
      },
    );
    expect(html).toContain("New &lt;safe&gt;");
    expect(html).toContain("font-family: var(--font-display)");
    expect(html).toContain("font-size: var(--text-heading-lg)");
    expect(html).toContain("color: var(--color-accent)");
    expect(html).toContain("text-align: center");
  });

  it("allows bounded destinations and rejects executable or missing actions", () => {
    const source =
      '<html><body><a data-edit-id="hero.cta" href="#old">Go</a><div id="contact"></div></body></html>';
    expect(
      applyElementPatchToHtml(source, "hero.cta", { href: "#contact" }),
    ).toContain('href="#contact"');
    expect(() =>
      applyElementPatchToHtml(source, "hero.cta", {
        href: "javascript:alert(1)",
      }),
    ).toThrow(ElementEditError);
    expect(() =>
      applyElementPatchToHtml(source, "hero.cta", { href: "#missing" }),
    ).toThrow(ElementEditError);
  });

  it("supports constrained native button actions without executable input", () => {
    const source =
      '<html><body><button data-edit-id="hero.button">Go</button><section id="contact"></section></body></html>';
    const html = applyElementPatchToHtml(source, "hero.button", {
      text: "Continue",
      buttonAction: { type: "scroll", target: "#contact" },
    });
    expect(html).toContain('data-onebox-action="scroll"');
    expect(html).toContain('data-onebox-target="contact"');
    expect(html).toContain("script data-onebox-actions");
    expect(() =>
      applyElementPatchToHtml(source, "hero.button", {
        buttonAction: { type: "scroll", target: "javascript:alert(1)" },
      }),
    ).toThrow(ElementEditError);
  });

  it("preserves an omitted native submit default on label-only edits", () => {
    const source =
      '<html><body><form><button data-edit-id="hero.button">Send</button></form></body></html>';
    const html = applyElementPatchToHtml(source, "hero.button", {
      text: "Submit now",
    });
    expect(html).toContain('data-edit-id="hero.button"');
    expect(html).not.toContain('type="button"');
    expect(html).not.toContain("data-onebox-action");
  });

  it("reorders only adjacent editable siblings", () => {
    const source =
      '<html><body><section><p data-edit-id="a.one">One</p><p data-edit-id="a.two">Two</p><span>fixed</span></section></body></html>';
    const moved = applyElementPatchToHtml(source, "a.two", {
      move: "previous",
    });
    expect(moved.indexOf("a.two")).toBeLessThan(moved.indexOf("a.one"));
    expect(() =>
      applyElementPatchToHtml(source, "a.two", { move: "next" }),
    ).toThrow(ElementEditError);
  });

  // canvas-upgrade Wave 5, Play 7. Sections live inside <main>; moving one
  // must carry its whole subtree, and every nested data-edit-id inside it
  // must still resolve afterwards -- not just the section's own id.
  it("carries a section's entire subtree across a reorder, every nested edit id intact", () => {
    const source =
      '<html><body><header data-edit-id="nav"><a data-edit-id="nav.logo">Logo</a></header>' +
      '<main>' +
      '<section data-edit-id="hero"><h1 data-edit-id="hero.headline">Hi</h1></section>' +
      '<section data-edit-id="services"><h2 data-edit-id="services.intro">Services</h2><p data-edit-id="services.card-1">Card</p></section>' +
      '</main>' +
      '<footer data-edit-id="footer"><p data-edit-id="footer.tagline">Tag</p></footer>' +
      '</body></html>';
    const moved = applyElementPatchToHtml(source, "hero", { move: "next" });
    // hero now sits after services in document order...
    expect(moved.indexOf('data-edit-id="services"')).toBeLessThan(
      moved.indexOf('data-edit-id="hero"'),
    );
    // ...and every leaf that traveled with hero, and every leaf that stayed
    // in services, is still present and still selectable by its own id.
    expect(moved).toContain('data-edit-id="hero.headline"');
    expect(moved).toContain('data-edit-id="services.intro"');
    expect(moved).toContain('data-edit-id="services.card-1"');
    // nav and footer, outside <main> entirely, are untouched by a move that
    // only ever looks at siblings within main.
    expect(moved).toContain('data-edit-id="nav.logo"');
    expect(moved).toContain('data-edit-id="footer.tagline"');
  });

  // canvas-upgrade Wave 5, Play 7 (hazard). Fixed page chrome -- nav and
  // footer, both direct children of <body> -- must refuse a reorder with a
  // clear reason. nav's "previous" move is the sharp case: the skip-link
  // immediately before it also carries data-edit-id, so without an explicit
  // chrome guard the generic sibling check would have silently accepted it
  // and swapped nav with the accessibility skip-link.
  it("refuses to reorder fixed page chrome instead of silently swapping it with the skip-link", () => {
    const source =
      '<html><body>' +
      '<a data-edit-id="skip-link" href="#main">Skip</a>' +
      '<header data-edit-id="nav"><a data-edit-id="nav.logo">Logo</a></header>' +
      '<main><section data-edit-id="hero"><h1 data-edit-id="hero.headline">Hi</h1></section></main>' +
      '<footer data-edit-id="footer"><p data-edit-id="footer.tagline">Tag</p></footer>' +
      '</body></html>';
    expect(() =>
      applyElementPatchToHtml(source, "nav", { move: "previous" }),
    ).toThrow(/fixed page chrome/);
    expect(() =>
      applyElementPatchToHtml(source, "nav", { move: "next" }),
    ).toThrow(/fixed page chrome/);
    expect(() =>
      applyElementPatchToHtml(source, "footer", { move: "previous" }),
    ).toThrow(/fixed page chrome/);
    expect(() =>
      applyElementPatchToHtml(source, "footer", { move: "next" }),
    ).toThrow(/fixed page chrome/);
  });

  // canvas-upgrade Wave 5, Play 7 (hazard). The hero is the first section in
  // main and has no valid "earlier" target; the last section before footer
  // has no valid "later" target. Both must refuse with a clear reason
  // rather than a silent no-op.
  it("refuses the first section moving earlier and the last section moving later", () => {
    const source =
      '<html><body>' +
      '<main>' +
      '<section data-edit-id="hero"><h1 data-edit-id="hero.headline">Hi</h1></section>' +
      '<section data-edit-id="contact"><p data-edit-id="contact.cta">Call</p></section>' +
      '</main>' +
      '<footer data-edit-id="footer"><p data-edit-id="footer.tagline">Tag</p></footer>' +
      '</body></html>';
    expect(() =>
      applyElementPatchToHtml(source, "hero", { move: "previous" }),
    ).toThrow(ElementEditError);
    expect(() =>
      applyElementPatchToHtml(source, "contact", { move: "next" }),
    ).toThrow(ElementEditError);
  });

  it("preserves existing typography on label-only edits and resets only explicit fields", () => {
    const source =
      '<html><body><a data-edit-id="hero.cta" href="#contact" style="font-size: var(--text-body-lg); color: var(--color-text)">Old</a><section id="contact"></section></body></html>';
    const labelOnly = applyElementPatchToHtml(source, "hero.cta", {
      text: "New",
      href: "#contact",
    });
    expect(labelOnly).toContain("font-size: var(--text-body-lg)");
    expect(labelOnly).toContain("color: var(--color-text)");
    const reset = applyElementPatchToHtml(labelOnly, "hero.cta", {
      typography: { fontSize: "inherit" },
    });
    expect(reset).not.toContain("font-size:");
    expect(reset).toContain("color: var(--color-text)");
  });
});

describe("element persistence history", () => {
  it("derives closed gate requests from structured patch fields and treats combined categories as mixed", async () => {
    const { sitesRoot } = await fixture();
    const requests: MutationGateRequestV1[] = [];
    const gateRunner: GateRunner = async (_runId, options) => {
      requests.push(options.afterEdit);
      return [];
    };
    const options = { sitesRoot, gateRunner };

    await applyStructuredElementEdit("test-run", "hero.headline", { text: "Content" }, options);
    expect(requests.splice(0)).toEqual([knownMutationGateRequest("content")]);

    await applyStructuredElementEdit(
      "test-run",
      "hero.headline",
      { typography: { weight: "700" } },
      options,
    );
    expect(requests.splice(0)).toEqual([knownMutationGateRequest("token-style")]);

    await applyStructuredElementEdit(
      "test-run",
      "hero.cta",
      { href: "https://example.com/contact" },
      options,
    );
    expect(requests.splice(0)).toEqual([knownMutationGateRequest("link-action")]);

    await applyStructuredElementEdit(
      "test-run",
      "hero.button",
      { buttonAction: { type: "scroll", target: "#contact" } },
      options,
    );
    expect(requests.splice(0)).toEqual([knownMutationGateRequest("link-action")]);

    await applyStructuredElementEdit("test-run", "hero.headline", { move: "next" }, options);
    expect(requests.splice(0)).toEqual([knownMutationGateRequest("structure")]);

    await applyStructuredElementEdit(
      "test-run",
      "hero.headline",
      { text: "Mixed", typography: { color: "accent" } },
      options,
    );
    expect(requests.splice(0)).toEqual([
      mixedMutationGateRequest(["content", "token-style"]),
    ]);
  });

  it("persists gate provenance so undo and redo reuse it, while legacy history fails closed", async () => {
    const { sitesRoot } = await fixture();
    const requests: MutationGateRequestV1[] = [];
    const gateRunner: GateRunner = async (_runId, options) => {
      requests.push(options.afterEdit);
      return [];
    };
    const options = { sitesRoot, gateRunner };
    const historyPath = path.join(sitesRoot, "test-run", "element-history.json");

    await applyStructuredElementEdit(
      "test-run",
      "hero.headline",
      { text: "Mixed", typography: { color: "accent" } },
      options,
    );
    const mixed = mixedMutationGateRequest(["content", "token-style"]);
    expect(JSON.parse(await fs.readFile(historyPath, "utf8"))).toMatchObject({
      entries: [{ gateRequest: mixed }],
    });
    requests.splice(0);

    await moveElementHistory("test-run", "undo", options);
    await moveElementHistory("test-run", "redo", options);
    expect(requests.splice(0)).toEqual([mixed, mixed]);

    const legacy = JSON.parse(await fs.readFile(historyPath, "utf8")) as {
      entries: Array<{ gateRequest?: MutationGateRequestV1 }>;
    };
    delete legacy.entries[0].gateRequest;
    await fs.writeFile(historyPath, `${JSON.stringify(legacy, null, 2)}\n`);
    await moveElementHistory("test-run", "undo", options);
    expect(requests.splice(0)).toEqual([unknownMutationGateRequest()]);
  });

  it("keeps an injected-root apply and undo away from the default run root", async () => {
    const runId = "element-injected-root";
    const defaultRunRoot = path.join(process.cwd(), "sites", runId);
    temporaryRoots.push(defaultRunRoot);
    await fs.rm(defaultRunRoot, { recursive: true, force: true });
    const { sitesRoot, siteDir, html } = await fixture(runId);
    const options = { sitesRoot, gateRunner: passGate };

    await applyStructuredElementEdit(
      runId,
      "hero.headline",
      { text: "Updated" },
      options,
    );
    await moveElementHistory(runId, "undo", options);

    expect(await fs.readFile(path.join(siteDir, "index.html"), "utf8")).toBe(html);
    await expect(fs.stat(defaultRunRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies actual values and supports explicit undo and redo", async () => {
    const { sitesRoot, siteDir } = await fixture();
    const options = { sitesRoot, gateRunner: passGate };
    await applyStructuredElementEdit(
      "test-run",
      "hero.headline",
      { text: "Persisted" },
      options,
    );
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Persisted");
    expect(await elementHistoryState("test-run", options)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    await moveElementHistory("test-run", "undo", options);
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Original");
    expect(await elementHistoryState("test-run", options)).toEqual({
      canUndo: false,
      canRedo: true,
    });

    await moveElementHistory("test-run", "redo", options);
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Persisted");
  });

  it("restores the pristine file when a blocking gate rejects the candidate", async () => {
    const { sitesRoot, siteDir, html } = await fixture();
    const failGate: GateRunner = async () => [
      {
        gate: "axe",
        pass: false,
        blocking: true,
        details: ["candidate failed"],
        ranAt: new Date().toISOString(),
      },
    ];
    await expect(
      applyStructuredElementEdit(
        "test-run",
        "hero.headline",
        { text: "Rejected" },
        { sitesRoot, gateRunner: failGate },
      ),
    ).rejects.toBeInstanceOf(BlockingMutationError);
    expect(await fs.readFile(path.join(siteDir, "index.html"), "utf8")).toBe(
      html,
    );
    expect(await elementHistoryState("test-run", { sitesRoot })).toEqual({
      canUndo: false,
      canRedo: false,
    });
  });

  it("restores gates.json byte-for-byte when candidate and restorative gate runs fail", async () => {
    const { sitesRoot, siteDir, html } = await fixture();
    const gatesPath = path.join(sitesRoot, "test-run", "gates.json");
    const originalGates = Buffer.from('[{"gate":"original","pass":true}]\n');
    await fs.writeFile(gatesPath, originalGates);
    let calls = 0;
    const failTwice: GateRunner = async () => {
      calls += 1;
      await fs.writeFile(
        gatesPath,
        calls === 1 ? "candidate gates" : "partial restorative gates",
      );
      if (calls === 2) throw new Error("restorative gate crashed");
      return [
        {
          gate: "axe",
          pass: false,
          blocking: true,
          details: ["candidate failed"],
          ranAt: new Date().toISOString(),
        },
      ];
    };

    await expect(
      applyStructuredElementEdit(
        "test-run",
        "hero.headline",
        { text: "Rejected" },
        { sitesRoot, gateRunner: failTwice },
      ),
    ).rejects.toBeInstanceOf(BlockingMutationError);
    expect(await fs.readFile(path.join(siteDir, "index.html"), "utf8")).toBe(html);
    expect(await fs.readFile(gatesPath)).toEqual(originalGates);
  });

  it("serializes concurrent applies so neither edit nor history entry is lost", async () => {
    const { sitesRoot, siteDir } = await fixture();
    const options = { sitesRoot, gateRunner: passGate };
    await Promise.all([
      applyStructuredElementEdit(
        "test-run",
        "hero.headline",
        { text: "First" },
        options,
      ),
      applyStructuredElementEdit(
        "test-run",
        "hero.cta",
        { text: "Second" },
        options,
      ),
    ]);
    const html = await fs.readFile(path.join(siteDir, "index.html"), "utf8");
    expect(html).toContain("First");
    expect(html).toContain("Second");
    await moveElementHistory("test-run", "undo", options);
    const afterUndo = await fs.readFile(
      path.join(siteDir, "index.html"),
      "utf8",
    );
    expect(afterUndo).toContain("First");
    expect(afterUndo).toContain("Call us");
  });

  it("orders an apply followed immediately by undo inside the same run lock", async () => {
    const { sitesRoot, siteDir } = await fixture();
    let releaseFirstGate: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirstGate = () => resolve();
    });
    let gateCalls = 0;
    const orderedGate: GateRunner = async () => {
      gateCalls += 1;
      if (gateCalls === 1) await firstGate;
      return passGate("test-run", {
        afterEdit: unknownMutationGateRequest(),
      });
    };
    const options = { sitesRoot, gateRunner: orderedGate };
    const apply = applyStructuredElementEdit(
      "test-run",
      "hero.headline",
      { text: "Transient" },
      options,
    );
    const undo = moveElementHistory("test-run", "undo", options);
    releaseFirstGate();
    await Promise.all([apply, undo]);
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Original");
    expect(await elementHistoryState("test-run", options)).toEqual({
      canUndo: false,
      canRedo: true,
    });
  });

  it("places natural-language HTML edits in the same chronology as structured edits", async () => {
    const { sitesRoot, siteDir } = await fixture();
    let releaseTransform: () => void = () => undefined;
    const transformGate = new Promise<void>((resolve) => {
      releaseTransform = resolve;
    });
    const options = { sitesRoot, gateRunner: passGate };
    const natural = applyElementHtmlEdit(
      "test-run",
      "hero.headline",
      async (html) => {
        await transformGate;
        return html.replace("Original", "Natural");
      },
      { ...options, gateRequest: unknownMutationGateRequest() },
    );
    const structured = applyStructuredElementEdit(
      "test-run",
      "hero.cta",
      { text: "Structured" },
      options,
    );
    releaseTransform();
    await Promise.all([natural, structured]);
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Natural");
    await moveElementHistory("test-run", "undo", options);
    const onceUndone = await fs.readFile(
      path.join(siteDir, "index.html"),
      "utf8",
    );
    expect(onceUndone).toContain("Natural");
    expect(onceUndone).toContain("Call us");
    await moveElementHistory("test-run", "undo", options);
    expect(
      await fs.readFile(path.join(siteDir, "index.html"), "utf8"),
    ).toContain("Original");
  });

  it("rolls back a rejected natural-language HTML candidate and its history", async () => {
    const { sitesRoot, siteDir, html } = await fixture();
    const failGate: GateRunner = async () => [
      {
        gate: "contract",
        pass: false,
        blocking: true,
        details: [],
        ranAt: new Date().toISOString(),
      },
    ];
    await expect(
      applyElementHtmlEdit(
        "test-run",
        "hero.headline",
        (source) => source.replace("Original", "Rejected natural"),
        {
          sitesRoot,
          gateRunner: failGate,
          gateRequest: unknownMutationGateRequest(),
        },
      ),
    ).rejects.toBeInstanceOf(BlockingMutationError);
    expect(await fs.readFile(path.join(siteDir, "index.html"), "utf8")).toBe(
      html,
    );
    expect(await elementHistoryState("test-run", { sitesRoot })).toEqual({
      canUndo: false,
      canRedo: false,
    });
  });
});

// canvas-upgrade Wave 5, Play 6. elementTree() is the Layers panel's data
// source -- reads the same on-disk site elementHistoryState reads, through
// assistant.ts's shared inventoryFromHtml() walker, never a second one.
describe("elementTree", () => {
  it("reads the live site's inventory with depth and parent ids, empty before a build", async () => {
    const { sitesRoot, siteDir } = await fixture();
    expect(await elementTree("test-run", { sitesRoot: path.join(sitesRoot, "no-such-run") })).toEqual([]);

    const nested =
      '<!doctype html><html><body><section data-edit-id="hero"><h1 data-edit-id="hero.headline">Hi</h1></section></body></html>';
    await fs.writeFile(path.join(siteDir, "index.html"), nested);

    const tree = await elementTree("test-run", { sitesRoot });
    expect(tree).toEqual([
      { editId: "hero", tag: "section", text: "Hi", depth: 0, parentEditId: null, container: true },
      { editId: "hero.headline", tag: "h1", text: "Hi", depth: 1, parentEditId: "hero", container: false },
    ]);
  });
});
