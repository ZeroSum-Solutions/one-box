import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  CandidateManifestV1Schema,
  MAX_CANDIDATE_BYTES,
  PageIrCompilerRequestV1Schema,
  type PagePurposeV1,
} from "./contracts";
import {
  PAGE_IR_COMPILER_VERSION,
  PageIrCompilerError,
  compilePageIRV1,
} from "./pageIrCompiler";
import { pageIrSha256 } from "./pageIrHash";
import { candidateBuildSha256 } from "./liveBundle";
import {
  COMPILER_PURPOSE_SECTIONS,
  compilerPageIr,
  compilerRequest,
  compilerRequestWithTwoAssets,
} from "./test-fixtures/pageIrCompilerFixtures";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const file = (result: ReturnType<typeof compilePageIRV1>, path: string) =>
  result.files.find((candidate) => candidate.path === path)!;
const fileMap = (result: ReturnType<typeof compilePageIRV1>) =>
  Object.fromEntries(result.files.map((candidate) => [candidate.path, Buffer.from(candidate.bytes).toString("hex")]));

function auditPureImportGraph(entries: string[]) {
  const pending = entries.map((entry) => new URL(entry, import.meta.url));
  const visited = new Set<string>();
  const violations: string[] = [];
  const deniedModules = /^(?:node:)?(?:fs(?:\/promises)?|path|http|https|net|tls|dns|child_process)$|(?:provider|openrouter|pipeline|builder|candidate|runstate|gates|evidence)/i;
  while (pending.length > 0) {
    const url = pending.pop()!;
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    const source = readFileSync(url, "utf8");
    const sourceFile = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const inspectModule = (specifier: string) => {
      if (deniedModules.test(specifier)) violations.push(`${url.pathname}: denied module ${specifier}`);
      if (specifier.startsWith(".")) {
        pending.push(new URL(specifier.endsWith(".ts") ? specifier : `${specifier}.ts`, url));
      }
    };
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        inspectModule(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          violations.push(`${url.pathname}: dynamic import`);
        }
        if (ts.isIdentifier(node.expression) && ["require", "fetch"].includes(node.expression.text)) {
          violations.push(`${url.pathname}: ${node.expression.text} call`);
        }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          ["require", "fetch"].includes(node.expression.name.text)
        ) {
          violations.push(`${url.pathname}: ${node.expression.name.text} call`);
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "process" &&
        node.name.text === "env"
      ) {
        violations.push(`${url.pathname}: process.env read`);
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "process" &&
        node.argumentExpression &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === "env"
      ) {
        violations.push(`${url.pathname}: process.env read`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { visited, violations };
}

function expectCompilerError(input: unknown, message: string) {
  try {
    compilePageIRV1(input);
    throw new Error("expected Page IR compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PageIrCompilerError);
    expect((error as Error).message).toBe(message);
  }
}

const IMAGE_CASES = [
  ["image/jpeg", "jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
  ["image/png", "png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/webp", "webp", new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  ["image/avif", "avif", new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])],
  ["image/gif", "gif", new TextEncoder().encode("GIF89a")],
] as const;

function replaceImage(
  request: ReturnType<typeof compilerRequest>,
  mediaType: (typeof IMAGE_CASES)[number][0],
  bytes: Uint8Array,
) {
  const digest = sha256(bytes);
  request.assets[0] = { assetId: "hero-image", mediaType, sha256: digest, bytes: new Uint8Array(bytes) };
  request.pageIr.assets[0] = {
    ...request.pageIr.assets[0],
    mediaType,
    sha256: digest,
    sizeBytes: bytes.byteLength,
  };
}

describe("compilePageIRV1", () => {
  it("pins the compiler version and closed exact inventory", () => {
    const result = compilePageIRV1(compilerRequest());
    expect(result.compilerVersion).toBe("page-ir-static@1");
    expect(PAGE_IR_COMPILER_VERSION).toBe("page-ir-static@1");
    expect(result.files.map((candidate) => candidate.path)).toEqual([
      "assets/hero-image.webp",
      "index.html",
      "site.css",
      "tokens.css",
    ]);
    expect(result.manifest.files.map((candidate) => candidate.path)).toEqual(result.files.map((candidate) => candidate.path));
    expect(result.manifestBytes).toEqual(new TextEncoder().encode(JSON.stringify(result.manifest, null, 2)));
    expect(CandidateManifestV1Schema.parse(result.manifest)).toEqual(result.manifest);
    const independentlyHashedRecords = result.files.map((candidate) => ({
      path: candidate.path,
      sizeBytes: candidate.bytes.byteLength,
      sha256: sha256(candidate.bytes),
    }));
    expect(result.manifest.files).toEqual(independentlyHashedRecords);
    expect(result.manifest.totalBytes).toBe(independentlyHashedRecords.reduce((total, candidate) => total + candidate.sizeBytes, 0));
    expect(result.manifest.buildSha256).toBe(candidateBuildSha256(independentlyHashedRecords));
    expect(result.pageIrSha256).toBe(pageIrSha256(compilerPageIr()));
    expect(JSON.stringify(result)).not.toMatch(/timestamp|createdAt|generatedAt|random/i);
  });

  it.each(Object.keys(COMPILER_PURPOSE_SECTIONS) as PagePurposeV1[])(
    "compiles %s identically ten times",
    (purpose) => {
      const results = Array.from({ length: 10 }, () => compilePageIRV1(compilerRequest(purpose)));
      const first = results[0];
      for (const result of results.slice(1)) {
        expect(fileMap(result)).toEqual(fileMap(first));
        expect(result.manifest).toEqual(first.manifest);
        expect(result.manifestBytes).toEqual(first.manifestBytes);
        expect(result.manifest.buildSha256).toBe(first.manifest.buildSha256);
        expect(result.pageIrSha256).toBe(first.pageIrSha256);
      }
    },
  );

  it.each(Object.entries(COMPILER_PURPOSE_SECTIONS) as Array<[PagePurposeV1, readonly string[]]>)(
    "renders purpose-specific %s sections, title, and skip target",
    (purpose, sectionIds) => {
      const html = decode(file(compilePageIRV1(compilerRequest(purpose)), "index.html").bytes);
      for (const sectionId of sectionIds) expect(html).toContain(`id="${sectionId}"`);
      expect(html).toContain(`<title>${purpose} &amp; &lt;proof&gt; "site"</title>`);
      expect(html).toContain(`<a class="skip-link" href="#${sectionIds[0]}">Skip to content</a>`);
    },
  );

  it("renders by graph order after every registry and both two-asset lists are shuffled", () => {
    const ordered = compilerRequestWithTwoAssets(32);
    const shuffled = compilerRequestWithTwoAssets(32);
    shuffled.pageIr.layoutProgram.nodes.reverse();
    shuffled.pageIr.content.reverse();
    shuffled.pageIr.actions.reverse();
    shuffled.pageIr.tokens.reverse();
    shuffled.pageIr.assets.reverse();
    shuffled.pageIr.slotBindings.reverse();
    shuffled.pageIr.nodeTokenBindings.reverse();
    shuffled.assets.reverse();
    const first = compilePageIRV1(ordered);
    const second = compilePageIRV1(shuffled);
    expect(fileMap(second)).toEqual(fileMap(first));
    expect(second.manifest).toEqual(first.manifest);
    expect(second.pageIrSha256).not.toBe(first.pageIrSha256);
    const html = decode(file(second, "index.html").bytes);
    expect(html.indexOf('id="header"')).toBeLessThan(html.indexOf('id="main"'));
    expect(html.indexOf('id="main"')).toBeLessThan(html.indexOf('id="footer"'));
    const sections = COMPILER_PURPOSE_SECTIONS["brochure-local-service"];
    expect(html.indexOf(`id="${sections[0]}"`)).toBeLessThan(html.indexOf(`id="${sections[1]}"`));
  });

  it("emits fixed responsive flow and reduced-motion CSS for every breakpoint", () => {
    const result = compilePageIRV1(compilerRequest());
    const css = decode(file(result, "site.css").bytes);
    const html = decode(file(result, "index.html").bytes);
    for (const prefix of ["s", "m", "l"]) {
      for (const flow of ["stack", "row", "grid", "overlay"]) {
        expect(css).toContain(`.flow-${prefix}-${flow}`);
      }
      expect(css).toContain(`.cols-${prefix}-12`);
    }
    expect(css).toContain("@media(min-width:48rem)");
    expect(css).toContain("@media(min-width:64rem)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    const concreteClasses = {
      document: "flow-s-stack flow-m-row flow-l-grid cols-l-4",
      header: "flow-s-row flow-m-grid cols-m-3 flow-l-overlay",
      navigation: "flow-s-overlay flow-m-stack flow-l-row",
      main: "flow-s-grid cols-s-2 flow-m-overlay flow-l-stack",
      hero: "flow-s-stack flow-m-row flow-l-overlay",
      services: "flow-s-grid cols-s-2 flow-m-overlay flow-l-row",
    } as const;
    for (const [nodeId, classes] of Object.entries(concreteClasses)) {
      expect(html).toMatch(new RegExp(`id="${nodeId}"[^>]*class="[^"]*${classes}`));
    }
  });

  it("emits one stable unique edit ID for every Page IR node", () => {
    const request = compilerRequest();
    const html = decode(file(compilePageIRV1(request), "index.html").bytes);
    const renderedIds = [...html.matchAll(/data-edit-id="([A-Za-z][A-Za-z0-9_-]*)"/g)].map((match) => match[1]);
    expect(renderedIds).toHaveLength(request.pageIr.layoutProgram.nodes.length);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(new Set(renderedIds)).toEqual(new Set(request.pageIr.layoutProgram.nodes.map((node) => node.id)));
    for (const node of request.pageIr.layoutProgram.nodes.filter((candidate) => candidate.kind !== "slot")) {
      expect(html).toContain(`id="${node.id}" data-edit-id="${node.id}"`);
    }
  });

  it("maps groups, ordered lists, and heading levels to fixed semantic elements", () => {
    for (const level of [2, 3, 4, 5, 6]) {
      const request = compilerRequest();
      const nodes = request.pageIr.layoutProgram.nodes;
      const hero = nodes.find((node) => node.id === "hero");
      if (!hero || hero.kind !== "section") throw new Error("fixture hero section missing");
      const priorChildren = [...hero.childIds];
      hero.childIds = ["hero-group"];
      nodes.push(
        { id: "hero-group", kind: "group", childIds: [...priorChildren, "subheading"], responsive: {
          small: { flow: "stack" }, medium: { flow: "row" }, large: { flow: "grid", columns: 2 },
        } },
        { id: "subheading", kind: "slot", slotType: "heading", level },
      );
      request.pageIr.content.push({ id: "subheading-copy", kind: "heading", text: `Level ${level}` });
      request.pageIr.slotBindings.push({ nodeId: "subheading", kind: "heading", contentId: "subheading-copy" });
      const listNode = nodes.find((node) => node.id === "feature-list");
      if (!listNode || listNode.kind !== "slot" || listNode.slotType !== "list") {
        throw new Error("fixture list slot missing");
      }
      listNode.ordered = true;
      const html = decode(file(compilePageIRV1(request), "index.html").bytes);
      expect(html).toContain('<div id="hero-group" data-edit-id="hero-group"');
      expect(html).toContain(`<h${level} data-edit-id="subheading">Level ${level}</h${level}>`);
      expect(html).toContain('<ol data-edit-id="feature-list">');
    }
  });

  it("escapes markup, title, labels, and alt text while keeping CSS compiler-authored", () => {
    const result = compilePageIRV1(compilerRequest());
    const html = decode(file(result, "index.html").bytes);
    const css = `${decode(file(result, "site.css").bytes)}\n${decode(file(result, "tokens.css").bytes)}`;
    expect(html).toContain("<title>brochure-local-service &amp; &lt;proof&gt; \"site\"</title>");
    expect(html).toContain("Safe &lt;b&gt;text&lt;/b&gt; &amp; honest copy");
    expect(html).toContain("alt=\"Team&#39;s &amp; &quot;friends&quot; &lt;today&gt;\"");
    expect(html).toContain("Email &lt;team&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:|data:/i);
    expect(css).not.toMatch(/style_alpha|Strong hero|Generic|brochure-local-service|proof/i);
    expect(css).toContain("--compiler-color");
    for (const category of ["color", "typography", "spacing", "radius", "shadow", "motion"]) {
      expect(html).toContain(`token-${category}`);
    }
  });

  it("keeps hostile accepted text inert in every free-text channel", () => {
    const input = compilerRequest();
    const hostile = `</title><script>alert("x")</script>&\"' javascript:data:`;
    for (const entry of input.pageIr.content) {
      if (entry.kind === "list") entry.items = [hostile];
      else entry.text = hostile;
    }
    input.pageIr.referenceContract.preserveTraits = [hostile];
    input.pageIr.referenceContract.rejects = [hostile];
    const media = input.pageIr.slotBindings.find((binding) => binding.kind === "media");
    if (!media || media.kind !== "media") throw new Error("fixture media binding missing");
    media.altText = hostile;
    const external = input.pageIr.actions.find((action) => action.kind === "external");
    if (!external || external.kind !== "external") throw new Error("fixture external action missing");
    external.href = "https://example.com/proof?q=%3Cscript%3E&safe=yes";

    const result = compilePageIRV1(input);
    const html = decode(file(result, "index.html").bytes);
    const css = `${decode(file(result, "site.css").bytes)}\n${decode(file(result, "tokens.css").bytes)}`;
    expect(html).not.toContain("<script");
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;alert(\"x\")&lt;/script&gt;&amp;\"' javascript:data:");
    expect(html).toContain("alt=\"&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&quot;&#39; javascript:data:\"");
    expect(html).not.toMatch(/(?:href|src)="(?:javascript:|data:)/i);
    expect(css).not.toMatch(/alert|javascript|data:|title/i);
  });

  it("rejects executable fields, unsafe action variants, data URLs, and hostile IDs at the closed schema", () => {
    const mutations: Array<(input: ReturnType<typeof compilerRequest>) => void> = [
      (input) => { (input.pageIr.content[0] as unknown as Record<string, unknown>).html = "<script>alert(1)</script>"; },
      (input) => { (input.pageIr.layoutProgram.nodes[0] as unknown as Record<string, unknown>).onClick = "alert(1)"; },
      (input) => { (input.pageIr.assets[0] as unknown as Record<string, unknown>).dataUrl = "data:image/png;base64,AAAA"; },
      (input) => { input.pageIr.layoutProgram.nodes.find((node) => node.id === "hero")!.id = "constructor"; },
      (input) => {
        const action = input.pageIr.actions.find((candidate) => candidate.kind === "external")!;
        (action as unknown as Record<string, unknown>).href = "javascript:alert(1)";
      },
      (input) => {
        const action = input.pageIr.actions.find((candidate) => candidate.kind === "external")!;
        (action as unknown as Record<string, unknown>).href = "data:text/html,<script>alert(1)</script>";
      },
      (input) => { (input.pageIr.actions[0] as unknown as Record<string, unknown>).kind = "submit"; },
    ];
    for (const mutate of mutations) {
      const input = compilerRequest();
      mutate(input);
      expectCompilerError(input, "Invalid Page IR compiler request");
    }
  });

  it("renders semantic markup, title, language, skip navigation, and all actions without JavaScript", () => {
    const html = decode(file(compilePageIRV1(compilerRequest()), "index.html").bytes);
    for (const tag of ["<body", "<header", "<nav", "<main", "<footer", "<section", "<h1", "<p", "<ul", "<img", "<a"]) {
      expect(html).toContain(tag);
    }
    expect(html).toContain('<html lang="en-US">');
    expect(html).toContain('<body id="document" data-edit-id="document"');
    expect(html).toContain('<nav id="navigation" data-edit-id="navigation"');
    expect(html).toContain('<main id="main" data-edit-id="main"');
    expect(html).toContain('<h1 data-edit-id="page-h1">');
    expect(html).toContain('<a class="skip-link" href="#hero">Skip to content</a>');
    expect(html).toContain('href="#hero"');
    expect(html).toContain('href="tel:+15550100400"');
    expect(html).toContain('href="mailto:hello@example.com"');
    expect(html).toContain('href="https://example.com/proof?a=1&amp;b=2"');
    expect(html).not.toMatch(/<form|<button|<script|onclick|innerHTML/i);
  });

  it("renders decorative media with an empty alt attribute", () => {
    const input = compilerRequest();
    const binding = input.pageIr.slotBindings.find((candidate) => candidate.kind === "media");
    if (!binding || binding.kind !== "media") throw new Error("fixture media binding missing");
    binding.decorative = true;
    delete binding.altText;
    const html = decode(file(compilePageIRV1(input), "index.html").bytes);
    expect(html).toContain('data-edit-id="hero-media" src="assets/hero-image.webp" alt=""');
  });

  it.each(IMAGE_CASES)("uses deterministic %s magic and .%s extension", (mediaType, extension, bytes) => {
    const request = compilerRequest();
    replaceImage(request, mediaType, bytes);
    const result = compilePageIRV1(request);
    expect(result.files.map((candidate) => candidate.path)).toEqual([
      `assets/hero-image.${extension}`,
      "index.html",
      "site.css",
      "tokens.css",
    ]);
    expect(file(result, `assets/hero-image.${extension}`).bytes).toEqual(bytes);
    expect(result.manifest.files).toEqual(result.files.map((candidate) => ({
      path: candidate.path,
      sizeBytes: candidate.bytes.byteLength,
      sha256: sha256(candidate.bytes),
    })));
    expect(result.manifest.files[0]).toEqual({
      path: `assets/hero-image.${extension}`,
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  });

  it("rejects missing, extra, and duplicate asset bindings", () => {
    const missing = compilerRequest(); missing.assets = [];
    expectCompilerError(missing, "Compiler requires the exact referenced asset binding set");
    const extra = compilerRequest(); extra.assets.push({ ...extra.assets[0], assetId: "extra-image" });
    expectCompilerError(extra, "Compiler requires the exact referenced asset binding set");
    const duplicate = compilerRequest(); duplicate.assets.push({ ...duplicate.assets[0], bytes: new Uint8Array(duplicate.assets[0].bytes) });
    expectCompilerError(duplicate, "Compiler asset bindings must be unique");
  });

  it("rejects SHA, metadata size, media type, and image-magic mismatches", () => {
    const badSha = compilerRequest(); badSha.assets[0].sha256 = "0".repeat(64);
    expectCompilerError(badSha, "Compiler asset SHA-256 does not match exact bytes and Page IR metadata");
    const badSize = compilerRequest(); badSize.pageIr.assets[0].sizeBytes += 1;
    expectCompilerError(badSize, "Compiler asset size does not match Page IR metadata");
    const badMedia = compilerRequest(); badMedia.assets[0].mediaType = "image/png";
    expectCompilerError(badMedia, "Compiler asset media type does not match Page IR metadata");
    const badMagic = compilerRequest();
    replaceImage(badMagic, "image/webp", new Uint8Array(12));
    expectCompilerError(badMagic, "Compiler asset image magic does not match its media type");
  });

  it("distinguishes the 100 MiB asset ceiling from candidate-manifest overhead", () => {
    const input = compilerRequestWithTwoAssets(100 * 1_024 * 1_024);
    expect(input.assets.reduce((total, asset) => total + asset.bytes.byteLength, 0)).toBe(100 * 1_024 * 1_024);
    expect(PageIrCompilerRequestV1Schema.safeParse(input).success).toBe(true);
    expectCompilerError(input, "Compiled Page IR candidate exceeds the closed manifest contract");

    const oneOver = compilerRequestWithTwoAssets(100 * 1_024 * 1_024);
    const prior = oneOver.assets[1].bytes;
    const expanded = new Uint8Array(prior.byteLength + 1);
    expanded.set(prior);
    oneOver.assets[1].bytes = expanded;
    oneOver.assets[1].sha256 = sha256(expanded);
    const parsed = PageIrCompilerRequestV1Schema.safeParse(oneOver);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("one-over compiler request unexpectedly parsed");
    expect(parsed.error.issues.map((issue) => issue.message)).toContain(
      "compiler assets exceed the 100 MiB aggregate maximum",
    );
  });

  it("accepts two assets whose bytes plus deterministic static overhead equal 100 MiB", () => {
    const probeAssetBytes = 32;
    const probe = compilePageIRV1(compilerRequestWithTwoAssets(probeAssetBytes));
    const staticOverhead = probe.manifest.totalBytes - probeAssetBytes;
    const result = compilePageIRV1(
      compilerRequestWithTwoAssets(MAX_CANDIDATE_BYTES - staticOverhead),
    );
    expect(result.manifest.totalBytes).toBe(MAX_CANDIDATE_BYTES);
    expect(result.files.map((candidate) => candidate.path)).toEqual([
      "assets/hero-image.webp",
      "assets/secondary-image.webp",
      "index.html",
      "site.css",
      "tokens.css",
    ]);
  });

  it("reparses Page IR through the closed contract", () => {
    const input: unknown = { ...compilerRequest(), pageIr: { ...compilerRequest().pageIr, target: "web-app" } };
    expectCompilerError(input, "Invalid Page IR compiler request");
  });

  it("rejects caller-selected versions and path, URL, or filename asset fields", () => {
    expectCompilerError(
      { ...compilerRequest(), compilerVersion: "caller-selected@9" },
      "Invalid Page IR compiler request",
    );
    for (const field of ["path", "url", "filename"]) {
      const input = compilerRequest() as ReturnType<typeof compilerRequest> & {
        assets: Array<Record<string, unknown>>;
      };
      input.assets[0][field] = field === "url" ? "https://example.com/image.webp" : "hero.webp";
      expectCompilerError(input, "Invalid Page IR compiler request");
    }
  });

  it("isolates input bytes and every returned compilation", () => {
    const input = compilerRequest();
    const before = structuredClone(input);
    const originalByte = input.assets[0].bytes[0];
    const first = compilePageIRV1(input);
    expect(input).toEqual(before);
    input.assets[0].bytes[0] = 0;
    expect(file(first, "assets/hero-image.webp").bytes[0]).toBe(originalByte);
    file(first, "assets/hero-image.webp").bytes[0] = 1;
    first.manifest.files[0].sha256 = "f".repeat(64);
    const second = compilePageIRV1(compilerRequest());
    expect(file(second, "assets/hero-image.webp").bytes[0]).toBe(originalByte);
    expect(second.manifest.files[0].sha256).not.toBe("f".repeat(64));
  });

  it("does not fetch, consume credentials, or emit remote/runtime dependencies", () => {
    const fetch = vi.fn(() => { throw new Error("network forbidden"); });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("OPENROUTER_API_KEY", "compiler-must-not-read-this-secret");
    try {
      const result = compilePageIRV1(compilerRequest());
      const output = result.files.map((candidate) => decode(candidate.bytes)).join("\n");
      expect(fetch).not.toHaveBeenCalled();
      expect(output).not.toContain("compiler-must-not-read-this-secret");
      expect(output).not.toMatch(/<script|\.js(?:["'])/i);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("keeps the recursive compiler/hash import graph pure through liveBundle", () => {
    const audit = auditPureImportGraph(["./pageIrCompiler.ts", "./pageIrHash.ts"]);
    const visitedFiles = [...audit.visited].map((href) => new URL(href).pathname.split("/").at(-1));
    expect(visitedFiles).toEqual(expect.arrayContaining([
      "pageIrCompiler.ts",
      "pageIrHash.ts",
      "liveBundle.ts",
      "contracts.ts",
    ]));
    expect(audit.violations).toEqual([]);
  });
});
