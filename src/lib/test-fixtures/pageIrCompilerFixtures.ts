import { createHash } from "node:crypto";
import {
  PageIRV1Schema,
  type PageIRV1,
  type PageIrCompilerRequestV1,
  type PagePurposeV1,
} from "../contracts";

export const COMPILER_PURPOSE_SECTIONS: Record<PagePurposeV1, readonly string[]> = {
  "brochure-local-service": ["hero", "services"],
  "portfolio-showcase": ["portfolio-intro", "project-gallery", "case-study"],
  "saas-marketing": ["product-hero", "features", "integrations", "pricing"],
  "editorial-index": ["editorial-index"],
  "campaign-landing": ["campaign-hero", "offer", "urgency"],
  "institutional-presence": ["mission", "governance", "programs", "history", "contact"],
};

const responsive = (
  small: "stack" | "row" | "grid" | "overlay",
  medium: "stack" | "row" | "grid" | "overlay",
  large: "stack" | "row" | "grid" | "overlay",
) => ({
  small: small === "grid" ? { flow: small, columns: 2 } : { flow: small },
  medium: medium === "grid" ? { flow: medium, columns: 3 } : { flow: medium },
  large: large === "grid" ? { flow: large, columns: 4 } : { flow: large },
});

export const COMPILER_WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const bytesSha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function sizedWebp(byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));
  bytes.set(COMPILER_WEBP_BYTES.slice(0, Math.min(byteLength, COMPILER_WEBP_BYTES.length)));
  return bytes;
}

export function compilerPageIr(
  purpose: PagePurposeV1 = "brochure-local-service",
): PageIRV1 {
  const sections = COMPILER_PURPOSE_SECTIONS[purpose];
  const firstSection = sections[0];
  const sectionNodes = sections.flatMap((sectionId, index) => index === 0
    ? [
        { id: sectionId, kind: "section" as const, childIds: ["page-h1", "intro-text", "hero-media", "feature-list", "primary-action"], responsive: responsive("stack", "row", "overlay") },
        { id: "page-h1", kind: "slot" as const, slotType: "heading" as const, level: 1 },
        { id: "intro-text", kind: "slot" as const, slotType: "text" as const },
        { id: "hero-media", kind: "slot" as const, slotType: "media" as const },
        { id: "feature-list", kind: "slot" as const, slotType: "list" as const, ordered: false },
        { id: "primary-action", kind: "slot" as const, slotType: "action" as const },
      ]
    : [
        { id: sectionId, kind: "section" as const, childIds: [`${sectionId}-copy`], responsive: responsive("grid", "overlay", "row") },
        { id: `${sectionId}-copy`, kind: "slot" as const, slotType: "text" as const },
      ]);

  return PageIRV1Schema.parse({
    schemaVersion: 1,
    target: "website",
    referenceContract: {
      schemaVersion: 1,
      selection: {
        mode: "selected",
        sources: [{ id: "style_alpha", kind: "refero-style", role: "primary" }],
      },
      preserveTraits: ["Strong hero & proof"],
      rhythm: "alternating",
      density: "comfortable",
      surfaceArc: ["base", "raised"],
      mediaTreatment: "contained",
      componentAnatomy: ["headline", "supporting-copy", "primary-action"],
      rejects: ["Generic <card> wall"],
      motion: { intent: "subtle", reducedMotion: "static" },
    },
    layoutProgram: {
      schemaVersion: 1,
      rootNodeId: "document",
      nodes: [
        { id: "document", kind: "document", childIds: ["header", "main", "footer"], responsive: responsive("stack", "row", "grid") },
        { id: "header", kind: "landmark", landmark: "header", childIds: ["navigation"], responsive: responsive("row", "grid", "overlay") },
        { id: "navigation", kind: "landmark", landmark: "navigation", childIds: ["nav-scroll", "nav-call", "nav-email", "nav-external"], responsive: responsive("overlay", "stack", "row") },
        { id: "nav-scroll", kind: "slot", slotType: "action" },
        { id: "nav-call", kind: "slot", slotType: "action" },
        { id: "nav-email", kind: "slot", slotType: "action" },
        { id: "nav-external", kind: "slot", slotType: "action" },
        { id: "main", kind: "landmark", landmark: "main", childIds: [...sections], responsive: responsive("grid", "overlay", "stack") },
        ...sectionNodes,
        { id: "footer", kind: "landmark", landmark: "footer", childIds: ["footer-text"], responsive: responsive("stack", "row", "grid") },
        { id: "footer-text", kind: "slot", slotType: "text" },
      ],
    },
    content: [
      { id: "page-title", kind: "heading", text: `${purpose} & <proof> "site"` },
      { id: "intro-copy", kind: "text", text: "Safe <b>text</b> & honest copy" },
      { id: "feature-items", kind: "list", items: ["First & foremost", "No <script> execution"] },
      { id: "scroll-label", kind: "text", text: "Skip & explore" },
      { id: "call-label", kind: "text", text: "Call 'today'" },
      { id: "email-label", kind: "text", text: "Email <team>" },
      { id: "external-label", kind: "text", text: "External \"proof\"" },
      { id: "primary-label", kind: "text", text: "Start & talk" },
      { id: "footer-copy", kind: "text", text: "Local & accountable" },
      ...sections.slice(1).map((sectionId) => ({ id: `${sectionId}-content`, kind: "text" as const, text: `Purpose copy for ${sectionId}` })),
    ],
    tokens: [
      { id: "color-primary", category: "color" },
      { id: "type-body", category: "typography" },
      { id: "space-layout", category: "spacing" },
      { id: "radius-card", category: "radius" },
      { id: "shadow-raised", category: "shadow" },
      { id: "motion-subtle", category: "motion" },
    ],
    assets: [{
      id: "hero-image",
      kind: "image",
      sha256: bytesSha256(COMPILER_WEBP_BYTES),
      mediaType: "image/webp",
      width: 1_600,
      height: 900,
      sizeBytes: COMPILER_WEBP_BYTES.byteLength,
    }],
    actions: [
      { id: "scroll-main", kind: "scroll-to", targetNodeId: firstSection },
      { id: "call-primary", kind: "call", phone: "+1 (555) 010-0400" },
      { id: "email-primary", kind: "email", email: "hello@example.com" },
      { id: "external-proof", kind: "external", href: "https://example.com/proof?a=1&b=2" },
    ],
    slotBindings: [
      { nodeId: "nav-scroll", kind: "action", labelContentId: "scroll-label", actionId: "scroll-main" },
      { nodeId: "nav-call", kind: "action", labelContentId: "call-label", actionId: "call-primary" },
      { nodeId: "nav-email", kind: "action", labelContentId: "email-label", actionId: "email-primary" },
      { nodeId: "nav-external", kind: "action", labelContentId: "external-label", actionId: "external-proof" },
      { nodeId: "page-h1", kind: "heading", contentId: "page-title" },
      { nodeId: "intro-text", kind: "text", contentId: "intro-copy" },
      { nodeId: "hero-media", kind: "media", assetId: "hero-image", decorative: false, altText: "Team's & \"friends\" <today>" },
      { nodeId: "feature-list", kind: "list", contentId: "feature-items" },
      { nodeId: "primary-action", kind: "action", labelContentId: "primary-label", actionId: "call-primary" },
      ...sections.slice(1).map((sectionId) => ({ nodeId: `${sectionId}-copy`, kind: "text" as const, contentId: `${sectionId}-content` })),
      { nodeId: "footer-text", kind: "text", contentId: "footer-copy" },
    ],
    nodeTokenBindings: [{
      nodeId: "document",
      tokens: {
        color: "color-primary",
        typography: "type-body",
        spacing: "space-layout",
        radius: "radius-card",
        shadow: "shadow-raised",
        motion: "motion-subtle",
      },
    }],
    accessibility: {
      language: "en-US",
      titleContentId: "page-title",
      navigationNodeId: "navigation",
      mainNodeId: "main",
      skipToNodeId: firstSection,
    },
  });
}

export function compilerRequest(
  purpose: PagePurposeV1 = "brochure-local-service",
): PageIrCompilerRequestV1 {
  const pageIr = compilerPageIr(purpose);
  return {
    schemaVersion: 1 as const,
    pageIr,
    assets: [{
      assetId: "hero-image",
      mediaType: "image/webp" as const,
      sha256: bytesSha256(COMPILER_WEBP_BYTES),
      bytes: new Uint8Array(COMPILER_WEBP_BYTES),
    }],
  };
}

export function compilerRequestWithTwoAssets(
  totalBytes: number,
): PageIrCompilerRequestV1 {
  const request = compilerRequest();
  const firstBytes = sizedWebp(Math.floor(totalBytes / 2));
  const secondBytes = sizedWebp(totalBytes - firstBytes.byteLength);
  const firstSha = bytesSha256(firstBytes);
  const secondSha = bytesSha256(secondBytes);
  const hero = request.pageIr.layoutProgram.nodes.find((node) => node.id === "hero");
  if (!hero || hero.kind !== "section") throw new Error("fixture hero section missing");
  hero.childIds.push("secondary-media");
  request.pageIr.layoutProgram.nodes.push({
    id: "secondary-media",
    kind: "slot",
    slotType: "media",
  });
  request.pageIr.assets = [
    { ...request.pageIr.assets[0], sha256: firstSha, sizeBytes: firstBytes.byteLength },
    {
      id: "secondary-image",
      kind: "image",
      sha256: secondSha,
      mediaType: "image/webp",
      width: 1_200,
      height: 800,
      sizeBytes: secondBytes.byteLength,
    },
  ];
  request.pageIr.slotBindings.push({
    nodeId: "secondary-media",
    kind: "media",
    assetId: "secondary-image",
    decorative: true,
  });
  request.pageIr.nodeTokenBindings.push({
    nodeId: "hero",
    tokens: { spacing: "space-layout" },
  });
  request.assets = [
    {
      assetId: "hero-image",
      mediaType: "image/webp",
      sha256: firstSha,
      bytes: firstBytes,
    },
    {
      assetId: "secondary-image",
      mediaType: "image/webp",
      sha256: secondSha,
      bytes: secondBytes,
    },
  ];
  return request;
}
