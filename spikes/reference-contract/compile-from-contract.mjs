/**
 * ReferenceContract -> LayoutProgramV1.
 *
 * The contract is the ONLY per-style input. Every decision function below is
 * a pure function of typed ReferenceContract fields — never of
 * `contract.contractId` or `contract.sourceStyle`. That mirrors compile.mjs's
 * own invariant #1 ("no branch may inspect a business name, run id, or
 * reference id"): here, no branch may inspect WHICH style this is, only
 * WHAT the style's contract says.
 *
 * The section PLAN (which roles exist, what content they carry) is a
 * business-level fact, not a style-level one — both contracts render the
 * SAME eight sections against the SAME WITS copy. Only kernel choice, ratio/
 * column counts, gap, surface assignment, and seam are contract-driven. This
 * is deliberately the same division of labour RESEARCH-LOG.md §6 describes
 * for Refero itself: "Refero supplies the vocabulary, not the composition
 * ... [the section list] came from the brief."
 *
 * Constraint SHAPES below are adapted from spikes/layout-ir's four
 * already-gate-passing programs (gutter-trade-split, gutter-editorial,
 * medspa-gallery, medspa-typographic) rather than invented from scratch —
 * reusing known-good grid/row placement avoids re-discovering C1's row-
 * collision and inert-focalCrop bugs. Where a shape is a close adaptation of
 * an existing program, the comment names which one.
 */

// ------------------------------------------------------------ decisions

/** Hero kernel + ratio. Driven by media.framing and density.class only. */
function heroKernel(contract) {
  if (contract.media.framing === "full-bleed-dramatic") {
    const ratio = contract.density.class === "compact" ? "6-6" : "5-7";
    return { kind: "split", ratio, gap: 3, reverseOnMobile: true };
  }
  // documentary-inset (or none): a typographic stack, media reads as an
  // inset plate, not a dominant mass.
  return { kind: "stack", align: "start", gap: contract.density.baseGapStep };
}

/** Proof (trust bar) kernel. Driven by componentPosture.depthMode: a border
 * posture reads as a vertical console readout; a shadow posture reads as a
 * calm, evenly spaced row. */
function proofKernel(contract) {
  if (contract.componentPosture.depthMode === "border") {
    return { kind: "stack", align: "start", gap: Math.max(0, contract.density.baseGapStep - 1) };
  }
  return { kind: "grid", columns: 3, gap: contract.density.baseGapStep };
}

/** Offer (services) kernel. Driven by density.class only — comfortable
 * density affords a wider 3-up grid (Ambrook's own documented rhythm quote,
 * see ambrook.contract.json's sectionRhythm provenance: "3-column card grid
 * for services"); compact density favours fewer, bolder tiles. */
function offerKernel(contract) {
  const columns = contract.density.class === "compact" ? 2 : 3;
  return { kind: "grid", columns, gap: contract.density.baseGapStep };
}

/** Story (differentiators) kernel. Driven by componentPosture.depthMode. */
function storyKernel(contract) {
  if (contract.componentPosture.depthMode === "border") {
    return { kind: "grid", columns: 2, gap: contract.density.baseGapStep };
  }
  return { kind: "split", ratio: "4-8", gap: 3 };
}

/** Area (coverage) kernel. Driven by componentPosture.depthMode. */
function areaKernel(contract) {
  if (contract.componentPosture.depthMode === "border") {
    return { kind: "grid", columns: 2, gap: contract.density.baseGapStep };
  }
  return { kind: "stack", align: "start", gap: 1 };
}

/** Contact (CTA) kernel. Driven by componentPosture.depthMode. */
function contactKernel(contract) {
  if (contract.componentPosture.depthMode === "border") {
    return { kind: "stack", align: "center", gap: 2 };
  }
  return { kind: "split", ratio: "7-5", gap: 3 };
}

/** Seam per role. nav/hero stay flush (chrome/page-open); footer always
 * carries the chrome rule; contact always gets breathing room via band
 * regardless of contract (a CTA band, not a technical grid line, in either
 * posture). Every other content section follows depthMode. */
function seamFor(contract, role) {
  if (role === "nav" || role === "hero") return "flush";
  if (role === "footer") return "rule";
  if (role === "contact") return "band";
  return contract.componentPosture.depthMode === "border" ? "rule" : "band";
}

/** Surface per role. nav/footer stay on the page surface (chrome). hero and
 * contact use the contract's distinguished heroSurface/ctaSurface. Every
 * other content section cycles contentSurfaces by content-position index —
 * a generic rule (`contentSurfaces[i % length]`), not a per-role lookup. */
function surfaceFor(contract, role, contentIndex) {
  if (role === "nav" || role === "footer") return "page";
  if (role === "hero") return contract.sectionRhythm.heroSurface;
  if (role === "contact") return contract.sectionRhythm.ctaSurface;
  const cycle = contract.sectionRhythm.contentSurfaces;
  return cycle[contentIndex % cycle.length];
}

// -------------------------------------------------------------- sections

function navSection(contract) {
  return {
    id: "nav",
    role: "nav",
    kernel: { kind: "split", ratio: "6-6", gap: 1 },
    surface: surfaceFor(contract, "nav"),
    seam: seamFor(contract, "nav"),
    slots: [
      { name: "heading", copyRef: "nav.logo" },
      { name: "actions", copyRef: "nav.phone" },
    ],
    constraints: [
      { type: "align", slot: "heading", axis: "block", value: "center" },
      { type: "align", slot: "actions", axis: "inline", value: "end" },
      { type: "align", slot: "actions", axis: "block", value: "center" },
    ],
  };
}

/** Adapted from gutter-editorial's hero (documentary-inset) and
 * gutter-trade-split's hero (full-bleed-dramatic) — both already gate-
 * passing, post-C1 shapes. */
function heroSection(contract, assets) {
  const kernel = heroKernel(contract);
  const slots = [
    { name: "eyebrow", copyRef: "hero.eyebrow" },
    { name: "heading", copyRef: "hero.headline" },
    { name: "lede", copyRef: "hero.sub" },
    { name: "actions", copyRef: "hero.cta" },
    { name: "media", assetRef: assets.hero },
  ];

  if (kernel.kind === "stack") {
    return {
      id: "hero",
      role: "hero",
      kernel,
      surface: surfaceFor(contract, "hero"),
      seam: seamFor(contract, "hero"),
      slots,
      constraints: [
        // Text block confined to columns 1-7; media confined to columns
        // 8-13. No shared columns — a first attempt spanned heading to
        // column 11 while media started at column 7, which visually
        // collided the h1 with the photograph (the two overlapped in
        // columns 7-11). Found by inspecting the rendered screenshot, not
        // by schema/gate failure — the constraint set was schema-valid and
        // gate-passing while still producing a broken hero, the exact
        // C1 lesson restated: geometry checks don't catch this class of
        // defect, only looking at the actual pixels does.
        { type: "span", slot: "eyebrow", from: 2, to: 7, row: 1 },
        { type: "span", slot: "heading", from: 1, to: 7, row: 2 },
        { type: "span", slot: "lede", from: 2, to: 6, row: 3 },
        { type: "span", slot: "actions", from: 2, to: 5, row: 4 },
        { type: "span", slot: "media", from: 8, to: 13, row: 1, rowSpan: 4 },
        { type: "measure", slot: "lede", value: "narrow" },
        { type: "align", slot: "media", axis: "block", value: "center" },
        { type: "focalCrop", slot: "media", x: 55, y: 45 },
        { type: "focalCrop", slot: "media", x: 50, y: 55, at: "mobile" },
      ],
    };
  }

  // split — full-bleed-dramatic
  return {
    id: "hero",
    role: "hero",
    kernel,
    surface: surfaceFor(contract, "hero"),
    seam: seamFor(contract, "hero"),
    slots,
    constraints: [
      { type: "span", slot: "eyebrow", from: 1, to: 2, row: 1 },
      { type: "span", slot: "heading", from: 1, to: 2, row: 2 },
      { type: "span", slot: "lede", from: 1, to: 2, row: 3 },
      { type: "span", slot: "actions", from: 1, to: 2, row: 4 },
      { type: "span", slot: "media", from: 2, to: 3, row: 1, rowSpan: 4 },
      { type: "measure", slot: "lede", value: "narrow" },
      { type: "align", slot: "media", axis: "block", value: "center" },
      // Step 2, not 3: at page.measure="wide" (--page-wide, 88rem) the shell
      // is only marginally narrower than a 1440px viewport, so its own
      // auto-centering margin plus inner padding leaves a bounded bleed
      // budget. Step 3 (--space-lg) overshoots that budget by 12px at
      // 1440px and produces horizontal overflow — found by verify.mjs's
      // (c) gate, the same overflow check C1 already relies on. Step 2
      // (--space-md) stays inside the budget at both verified viewports
      // (1440/390) while still bleeding noticeably more than Ambrook's
      // zero-bleed documentary inset. Not proven safe at arbitrary viewport
      // widths between ~1408 and ~1440 — flagged honestly in FINDINGS.md
      // rather than silently narrowed to "safe everywhere".
      { type: "bleed", slot: "media", side: "inline-end", step: 2 },
      { type: "focalCrop", slot: "media", x: 60, y: 35 },
      { type: "focalCrop", slot: "media", x: 50, y: 50, at: "mobile" },
    ],
  };
}

/** Adapted from gutter-trade-split's proof (grid) and gutter-editorial's
 * proof (stack). */
function proofSection(contract, contentIndex) {
  const kernel = proofKernel(contract);
  const base = {
    id: "proof",
    role: "proof",
    kernel,
    surface: surfaceFor(contract, "proof", contentIndex),
    seam: seamFor(contract, "proof"),
    slots: [{ name: "items", collectionRef: "trust-bar.stat" }],
  };
  if (kernel.kind === "grid") {
    return {
      ...base,
      constraints: [
        { type: "span", slot: "items", from: 1, to: kernel.columns + 1 },
        { type: "align", slot: "items", axis: "inline", value: "stretch" },
      ],
    };
  }
  return { ...base, constraints: [{ type: "span", slot: "items", from: 2, to: 12 }] };
}

/** Adapted from gutter-trade-split's offer (grid columns=2). */
function offerSection(contract, contentIndex) {
  const kernel = offerKernel(contract);
  const to = kernel.columns + 1;
  return {
    id: "offer",
    role: "offer",
    kernel,
    surface: surfaceFor(contract, "offer", contentIndex),
    seam: seamFor(contract, "offer"),
    slots: [
      { name: "heading", copyRef: "services.intro" },
      { name: "items", collectionRef: "services.card" },
    ],
    constraints: [
      { type: "span", slot: "heading", from: 1, to },
      { type: "span", slot: "items", from: 1, to },
      { type: "measure", slot: "heading", value: "normal" },
    ],
  };
}

/** Adapted from gutter-editorial's why (split) and gutter-trade-split's why
 * (grid). */
function storySection(contract, contentIndex) {
  const kernel = storyKernel(contract);
  const base = {
    id: "why",
    role: "story",
    kernel,
    surface: surfaceFor(contract, "story", contentIndex),
    seam: seamFor(contract, "story"),
    slots: [
      { name: "heading", copyRef: "why-us.intro" },
      { name: "items", collectionRef: "why-us.point" },
    ],
  };
  if (kernel.kind === "split") {
    return {
      ...base,
      constraints: [
        { type: "span", slot: "heading", from: 1, to: 2, row: 1 },
        { type: "span", slot: "items", from: 2, to: 3, row: 1 },
        { type: "align", slot: "heading", axis: "block", value: "start" },
        { type: "measure", slot: "heading", value: "narrow" },
      ],
    };
  }
  return {
    ...base,
    constraints: [
      { type: "span", slot: "heading", from: 1, to: 3 },
      { type: "span", slot: "items", from: 1, to: 3 },
    ],
  };
}

/** Adapted from gutter-trade-split's area (stack, full-width band). Grid
 * variant follows the same span shape as offerSection's grid. */
function areaSection(contract, contentIndex) {
  const kernel = areaKernel(contract);
  const base = {
    id: "area",
    role: "area",
    kernel,
    surface: surfaceFor(contract, "area", contentIndex),
    seam: seamFor(contract, "area"),
    slots: [
      { name: "heading", copyRef: "service-area.intro" },
      { name: "items", collectionRef: "service-area.area" },
    ],
  };
  if (kernel.kind === "grid") {
    const to = kernel.columns + 1;
    return {
      ...base,
      constraints: [
        { type: "span", slot: "heading", from: 1, to },
        { type: "span", slot: "items", from: 1, to },
        { type: "measure", slot: "heading", value: "normal" },
      ],
    };
  }
  return {
    ...base,
    constraints: [
      { type: "span", slot: "heading", from: 1, to: 8 },
      { type: "span", slot: "items", from: 1, to: 13 },
      { type: "measure", slot: "heading", value: "normal" },
    ],
  };
}

/** Adapted from gutter-trade-split's contact (split) and medspa-
 * typographic's contact (stack). */
function contactSection(contract) {
  const kernel = contactKernel(contract);
  const base = {
    id: "contact",
    role: "contact",
    kernel,
    surface: surfaceFor(contract, "contact"),
    seam: seamFor(contract, "contact"),
    slots: [
      { name: "heading", copyRef: "contact.headline" },
      { name: "lede", copyRef: "contact.sub" },
      { name: "actions", copyRef: "contact.cta" },
    ],
  };
  if (kernel.kind === "split") {
    return {
      ...base,
      constraints: [
        { type: "span", slot: "heading", from: 1, to: 2, row: 1 },
        { type: "span", slot: "lede", from: 1, to: 2, row: 2 },
        { type: "span", slot: "actions", from: 2, to: 3, row: 1, rowSpan: 2 },
        { type: "align", slot: "actions", axis: "block", value: "center" },
        { type: "align", slot: "actions", axis: "inline", value: "end" },
      ],
    };
  }
  return {
    ...base,
    constraints: [
      { type: "span", slot: "heading", from: 1, to: 13, row: 1 },
      { type: "align", slot: "heading", axis: "inline", value: "center" },
      { type: "span", slot: "lede", from: 3, to: 11, row: 2 },
      { type: "align", slot: "lede", axis: "inline", value: "center" },
      { type: "span", slot: "actions", from: 1, to: 13, row: 3 },
      { type: "align", slot: "actions", axis: "inline", value: "center" },
    ],
  };
}

/** Chrome — deliberately identical shape for both contracts (adapted from
 * gutter-trade-split's footer). Footer is page-level chrome, not composition. */
function footerSection(contract) {
  return {
    id: "footer",
    role: "footer",
    kernel: { kind: "split", ratio: "8-4", gap: 1 },
    surface: surfaceFor(contract, "footer"),
    seam: seamFor(contract, "footer"),
    slots: [
      { name: "heading", copyRef: "footer.business-name" },
      { name: "caption", copyRef: "footer.tagline" },
      { name: "actions", copyRef: "footer.phone" },
    ],
    constraints: [
      { type: "span", slot: "heading", from: 1, to: 2, row: 1 },
      { type: "span", slot: "caption", from: 1, to: 2, row: 2 },
      { type: "span", slot: "actions", from: 2, to: 3, row: 1, rowSpan: 2 },
      { type: "align", slot: "actions", axis: "inline", value: "end" },
    ],
  };
}

// ------------------------------------------------------------------ page

/** page.family/measure are descriptive metadata in schema.mjs — compile.mjs
 * does not read page.family at all, and reads page.measure only for the
 * shell's max-inline-size. Still contract-driven, for honesty of record. */
function pageOf(contract) {
  const family = contract.media.framing === "full-bleed-dramatic"
    ? "trade-split"
    : "editorial-asymmetric";
  const measure = contract.density.class === "compact" ? "wide" : "normal";
  const density = contract.density.class === "compact" ? "compact" : "regular";
  const seam = contract.componentPosture.depthMode === "border" ? "rule" : "band";
  return {
    family,
    measure,
    density,
    seam,
    nav: contract.componentPosture.depthMode === "border" ? "utility" : "split-cta",
    footer: "thin",
  };
}

/**
 * @param {object} contract - a parsed ReferenceContract (contract-schema.mjs)
 * @param {object} assets - { hero: "assets/xxx.jpg" } run-relative asset refs
 * @returns {object} an unparsed LayoutProgramV1 (schemaVersion/programId/
 *   inputs are NOT filled in here — the caller's build harness owns those,
 *   same division of labour as spikes/layout-ir/build.mjs's $sourceRun).
 */
export function contractToProgram(contract, assets) {
  const contentOrder = ["proof", "offer", "story", "area"];
  const sectionsByRole = {
    proof: proofSection(contract, contentOrder.indexOf("proof")),
    offer: offerSection(contract, contentOrder.indexOf("offer")),
    story: storySection(contract, contentOrder.indexOf("story")),
    area: areaSection(contract, contentOrder.indexOf("area")),
  };

  return {
    page: pageOf(contract),
    sections: [
      navSection(contract),
      heroSection(contract, assets),
      sectionsByRole.proof,
      sectionsByRole.offer,
      sectionsByRole.story,
      sectionsByRole.area,
      contactSection(contract),
      footerSection(contract),
    ],
  };
}
