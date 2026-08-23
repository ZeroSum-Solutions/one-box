import { createHash } from "node:crypto";
import {
  CandidateManifestV1Schema,
  PageIrCompilerRequestV1Schema,
  type ActionV1,
  type CandidateFileRecord,
  type CandidateManifestV1,
  type PageIRV1,
  type PageIrAssetMediaTypeV1,
  type PageIrCompilerAssetBindingV1,
} from "./contracts";
import { pageIrSha256 } from "./pageIrHash";
import { candidateBuildSha256 } from "./liveBundle";

export const PAGE_IR_COMPILER_VERSION = "page-ir-static@1" as const;

export interface PageIrCompiledFileV1 {
  path: string;
  bytes: Uint8Array;
}

export interface PageIrCompilationResultV1 {
  compilerVersion: typeof PAGE_IR_COMPILER_VERSION;
  pageIrSha256: string;
  files: PageIrCompiledFileV1[];
  manifest: CandidateManifestV1;
  manifestBytes: Uint8Array;
}

export class PageIrCompilerError extends Error {
  constructor(message: string) {
    super(message.slice(0, 240));
    this.name = "PageIrCompilerError";
  }
}

function fail(message: string): never {
  throw new PageIrCompilerError(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const EXTENSION_BY_MEDIA_TYPE: Record<PageIrAssetMediaTypeV1, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function hasImageMagic(mediaType: PageIrAssetMediaTypeV1, bytes: Uint8Array): boolean {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);
  }
  if (mediaType === "image/webp") {
    return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  if (mediaType === "image/avif") {
    if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return false;
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
      if (["avif", "avis"].includes(ascii(bytes, offset, offset + 4))) return true;
    }
    return false;
  }
  return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
}

function assetOutputPath(assetId: string, mediaType: PageIrAssetMediaTypeV1): string {
  return `assets/${assetId}.${EXTENSION_BY_MEDIA_TYPE[mediaType]}`;
}

function fixedColumns(prefix: "s" | "m" | "l"): string {
  return Array.from(
    { length: 12 },
    (_, index) => `.cols-${prefix}-${index + 1}{grid-template-columns:repeat(${index + 1},minmax(0,1fr))}`,
  ).join("\n");
}

const TOKENS_CSS = `:root{
  --compiler-color:#172033;
  --compiler-font:ui-sans-serif,system-ui,sans-serif;
  --compiler-space:1rem;
  --compiler-radius:.5rem;
  --compiler-shadow:0 .25rem 1rem rgb(15 23 42 / .14);
  --compiler-motion:160ms;
}`;

const SITE_CSS = `*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;color:#172033;background:#fff;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5}
header,nav,main,footer,section,div{min-width:0}
header,main,footer{padding:1rem}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
.skip-link{position:absolute;left:.5rem;top:.5rem;transform:translateY(-200%);background:#fff;padding:.75rem;z-index:1}
.skip-link:focus{transform:none}
.token-color{color:var(--compiler-color)}
.token-typography{font-family:var(--compiler-font)}
.token-spacing{gap:var(--compiler-space)}
.token-radius{border-radius:var(--compiler-radius)}
.token-shadow{box-shadow:var(--compiler-shadow)}
.token-motion{transition-duration:var(--compiler-motion)}
.flow-s-stack{display:flex;flex-direction:column}
.flow-s-row{display:flex;flex-direction:row;flex-wrap:wrap}
.flow-s-grid{display:grid}
.flow-s-overlay{display:grid}
.flow-s-overlay>*{grid-area:1/1}
${fixedColumns("s")}
@media(min-width:48rem){
  .flow-m-stack{display:flex;flex-direction:column}
  .flow-m-row{display:flex;flex-direction:row;flex-wrap:wrap}
  .flow-m-grid{display:grid}
  .flow-m-overlay{display:grid}
  .flow-m-overlay>*{grid-area:1/1}
  ${fixedColumns("m")}
}
@media(min-width:64rem){
  .flow-l-stack{display:flex;flex-direction:column}
  .flow-l-row{display:flex;flex-direction:row;flex-wrap:wrap}
  .flow-l-grid{display:grid}
  .flow-l-overlay{display:grid}
  .flow-l-overlay>*{grid-area:1/1}
  ${fixedColumns("l")}
}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation:none!important;transition:none!important}
}`;

type LayoutNode = PageIRV1["layoutProgram"]["nodes"][number];

function responsiveClasses(node: Exclude<LayoutNode, { kind: "slot" }>): string[] {
  const classes: string[] = [];
  for (const [breakpoint, prefix] of [
    ["small", "s"],
    ["medium", "m"],
    ["large", "l"],
  ] as const) {
    const intent = node.responsive[breakpoint];
    classes.push(`flow-${prefix}-${intent.flow}`);
    if (intent.flow === "grid") classes.push(`cols-${prefix}-${intent.columns}`);
  }
  return classes;
}

function actionHref(action: ActionV1): string {
  if (action.kind === "scroll-to") return `#${action.targetNodeId}`;
  if (action.kind === "call") return `tel:${action.phone.replace(/[ ()-]/g, "")}`;
  if (action.kind === "email") return `mailto:${action.email}`;
  return action.href;
}

function renderDocument(pageIr: PageIRV1): string {
  const nodes = new Map(pageIr.layoutProgram.nodes.map((node) => [node.id, node]));
  const content = new Map(pageIr.content.map((entry) => [entry.id, entry]));
  const actions = new Map(pageIr.actions.map((action) => [action.id, action]));
  const assets = new Map(pageIr.assets.map((asset) => [asset.id, asset]));
  const slotBindings = new Map(pageIr.slotBindings.map((binding) => [binding.nodeId, binding]));
  const tokenBindings = new Map(pageIr.nodeTokenBindings.map((binding) => [binding.nodeId, binding]));

  const nodeClasses = (node: LayoutNode): string => {
    const classes = node.kind === "slot" ? [] : responsiveClasses(node);
    const tokenBinding = tokenBindings.get(node.id);
    if (tokenBinding) {
      classes.push(...Object.keys(tokenBinding.tokens).sort().map((category) => `token-${category}`));
    }
    return classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
  };

  const renderSlot = (node: Extract<LayoutNode, { kind: "slot" }>): string => {
    const binding = slotBindings.get(node.id)!;
    const common = ` data-edit-id="${escapeAttribute(node.id)}"${nodeClasses(node)}`;
    if (binding.kind === "heading" && node.slotType === "heading") {
      const entry = content.get(binding.contentId)!;
      const text = entry.kind === "heading" ? entry.text : "";
      return `<h${node.level}${common}>${escapeText(text)}</h${node.level}>`;
    }
    if (binding.kind === "text") {
      const entry = content.get(binding.contentId)!;
      const text = entry.kind === "text" ? entry.text : "";
      return `<p${common}>${escapeText(text)}</p>`;
    }
    if (binding.kind === "list") {
      const entry = content.get(binding.contentId)!;
      const items = entry.kind === "list" ? entry.items : [];
      const tag = node.slotType === "list" && node.ordered ? "ol" : "ul";
      return `<${tag}${common}>${items.map((item) => `<li>${escapeText(item)}</li>`).join("")}</${tag}>`;
    }
    if (binding.kind === "media") {
      const asset = assets.get(binding.assetId)!;
      const alt = binding.decorative ? "" : binding.altText ?? "";
      return `<img${common} src="${assetOutputPath(asset.id, asset.mediaType)}" alt="${escapeAttribute(alt)}" width="${asset.width}" height="${asset.height}">`;
    }
    if (binding.kind !== "action") fail("Validated action slot binding is inconsistent");
    const label = content.get(binding.labelContentId)!;
    const action = actions.get(binding.actionId)!;
    const text = label.kind === "text" ? label.text : "";
    return `<a${common} href="${escapeAttribute(actionHref(action))}">${escapeText(text)}</a>`;
  };

  const renderNode = (nodeId: string): string => {
    const node = nodes.get(nodeId)!;
    if (node.kind === "slot") return renderSlot(node);
    const children = node.childIds.map(renderNode).join("");
    const common = ` id="${escapeAttribute(node.id)}" data-edit-id="${escapeAttribute(node.id)}"${nodeClasses(node)}`;
    if (node.kind === "document") return `<body${common}>${skipLink}${children}</body>`;
    if (node.kind === "landmark") {
      const tag = node.landmark === "navigation" ? "nav" : node.landmark;
      return `<${tag}${common}>${children}</${tag}>`;
    }
    const tag = node.kind === "section" ? "section" : "div";
    return `<${tag}${common}>${children}</${tag}>`;
  };

  const titleEntry = content.get(pageIr.accessibility.titleContentId)!;
  const title = titleEntry.kind === "list" ? "" : titleEntry.text;
  const skipLink = `<a class="skip-link" href="#${escapeAttribute(pageIr.accessibility.skipToNodeId)}">Skip to content</a>`;
  return `<!doctype html>\n<html lang="${escapeAttribute(pageIr.accessibility.language)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeText(title)}</title>\n<link rel="stylesheet" href="tokens.css">\n<link rel="stylesheet" href="site.css">\n</head>\n${renderNode(pageIr.layoutProgram.rootNodeId)}\n</html>\n`;
}

function exactAssetBindings(
  pageIr: PageIRV1,
  bindings: PageIrCompilerAssetBindingV1[],
): Map<string, PageIrCompilerAssetBindingV1> {
  const referenced = new Set(
    pageIr.slotBindings.flatMap((binding) =>
      binding.kind === "media" ? [binding.assetId] : [],
    ),
  );
  const byId = new Map<string, PageIrCompilerAssetBindingV1>();
  for (const binding of bindings) {
    if (byId.has(binding.assetId)) fail("Compiler asset bindings must be unique");
    byId.set(binding.assetId, binding);
  }
  if (
    byId.size !== referenced.size ||
    [...referenced].some((assetId) => !byId.has(assetId)) ||
    [...byId].some(([assetId]) => !referenced.has(assetId))
  ) {
    fail("Compiler requires the exact referenced asset binding set");
  }
  return byId;
}

function compiledAssets(
  pageIr: PageIRV1,
  bindings: Map<string, PageIrCompilerAssetBindingV1>,
): PageIrCompiledFileV1[] {
  const registry = new Map(pageIr.assets.map((asset) => [asset.id, asset]));
  return [...bindings.values()].map((binding) => {
    const metadata = registry.get(binding.assetId)!;
    const bytes = new Uint8Array(binding.bytes);
    if (binding.mediaType !== metadata.mediaType) fail("Compiler asset media type does not match Page IR metadata");
    if (bytes.byteLength !== metadata.sizeBytes) fail("Compiler asset size does not match Page IR metadata");
    if (binding.sha256 !== metadata.sha256 || sha256(bytes) !== binding.sha256) {
      fail("Compiler asset SHA-256 does not match exact bytes and Page IR metadata");
    }
    if (!hasImageMagic(binding.mediaType, bytes)) fail("Compiler asset image magic does not match its media type");
    return { path: assetOutputPath(binding.assetId, binding.mediaType), bytes };
  });
}

function textFile(path: string, value: string): PageIrCompiledFileV1 {
  return { path, bytes: new TextEncoder().encode(value) };
}

export function compilePageIRV1(input: unknown): PageIrCompilationResultV1 {
  const parsed = PageIrCompilerRequestV1Schema.safeParse(input);
  if (!parsed.success) fail("Invalid Page IR compiler request");
  const pageIr = parsed.data.pageIr;
  const bindings = exactAssetBindings(pageIr, parsed.data.assets);
  const files = [
    ...compiledAssets(pageIr, bindings),
    textFile("index.html", renderDocument(pageIr)),
    textFile("site.css", SITE_CSS),
    textFile("tokens.css", TOKENS_CSS),
  ]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    .map((file) => ({ path: file.path, bytes: new Uint8Array(file.bytes) }));
  const records: CandidateFileRecord[] = files.map((file) => ({
    path: file.path,
    sizeBytes: file.bytes.byteLength,
    sha256: sha256(file.bytes),
  }));
  const manifest = CandidateManifestV1Schema.safeParse({
    schemaVersion: 1,
    entry: "index.html",
    files: records,
    totalBytes: records.reduce((total, file) => total + file.sizeBytes, 0),
    buildSha256: candidateBuildSha256(records),
  });
  if (!manifest.success) fail("Compiled Page IR candidate exceeds the closed manifest contract");
  return {
    compilerVersion: PAGE_IR_COMPILER_VERSION,
    pageIrSha256: pageIrSha256(pageIr),
    files,
    manifest: manifest.data,
    manifestBytes: new TextEncoder().encode(JSON.stringify(manifest.data, null, 2)),
  };
}
