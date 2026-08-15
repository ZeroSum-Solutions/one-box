/**
 * Deterministic LayoutProgramV1 -> { html, css, provenance } compiler.
 *
 * Invariants this file must never break:
 *   1. No branch may inspect a business name, run id, or reference id.
 *      The only inputs are the program, approved tokens, and approved copy.
 *   2. Every design SCALAR emitted into CSS is either a var(--token) reference
 *      or an approved derived step recorded in the provenance ledger.
 *      CSS grammar (grid, minmax, auto, fr, %) is compiler structure, not a
 *      design scalar.
 *   3. No case-specific macro. Three kernels, applied uniformly.
 *   4. Editor ids are `${section.id}.${slot}` — derived from stable program
 *      ids, never from DOM position or output order.
 */

const GRID_TRACKS = 12;

/** Spacing steps resolve to approved spacing tokens, not to numbers. */
const SPACE_STEP_TOKENS = ["--space-xs", "--space-sm", "--space-md", "--space-lg"];

const MEASURE_TOKENS = {
  narrow: "--measure-narrow",
  normal: "--measure-normal",
  wide: "--measure-wide",
};

/** Page canvas width — deliberately a different scale from text measure. */
const PAGE_TOKENS = {
  narrow: "--page-narrow",
  normal: "--page-normal",
  wide: "--page-wide",
};

const RHYTHM_TOKENS = {
  compact: "--rhythm-compact",
  regular: "--rhythm-regular",
  editorial: "--rhythm-editorial",
};

const DENSITY_STEP = { compact: 2, regular: 3, editorial: 3 };

const SURFACE_TOKENS = {
  page: "--color-bg",
  raised: "--color-surface",
  inverted: "--color-text",
  accent: "--color-primary",
};

const SURFACE_INK = {
  page: "--color-text",
  raised: "--color-text",
  inverted: "--color-bg",
  accent: "--color-primary-contrast",
};

/** Secondary ink per surface. On accent/inverted surfaces the page's muted
 * grey is illegible, so each surface names its own quiet colour. */
const SURFACE_INK_MUTED = {
  page: "--color-text-muted",
  raised: "--color-text-muted",
  inverted: "--color-bg",
  accent: "--color-primary-contrast",
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const RATIO_TRACKS = {
  "3-9": [3, 9], "4-8": [4, 8], "5-7": [5, 7], "6-6": [6, 6],
  "7-5": [7, 5], "8-4": [8, 4], "9-3": [9, 3],
};

class Provenance {
  constructor() {
    this.entries = [];
  }
  /** Record one emitted declaration and why it is legal. */
  note(selector, property, value, origin) {
    this.entries.push({ selector, property, value, ...origin });
    return `${property}: ${value};`;
  }
}

/** A spacing step becomes a token reference — never a literal length. */
function space(step) {
  const index = Math.max(0, Math.min(SPACE_STEP_TOKENS.length - 1, step));
  return `var(${SPACE_STEP_TOKENS[index]})`;
}

function slotSelector(sectionId, slot) {
  return `[data-edit-id="${sectionId}.${slot}"]`;
}

function sectionSelector(sectionId) {
  return `[data-section="${sectionId}"]`;
}

function breakpointQuery(at) {
  if (at === "mobile") return "@media (max-width: 767px)";
  if (at === "tablet") return "@media (min-width: 768px) and (max-width: 1199px)";
  return "@media (min-width: 1200px)";
}

/** Kernel -> base grid. This is compiler structure. */
function kernelCss(section, prov, density, pageDensity) {
  const sel = sectionSelector(section.id);
  const gap = space(section.kernel.gap ?? density);
  const decls = [];
  decls.push(prov.note(sel, "display", "grid", { kind: "structure", reason: "kernel base" }));
  decls.push(prov.note(sel, "gap", gap, {
    kind: "token-step", token: SPACE_STEP_TOKENS[section.kernel.gap ?? density],
    reason: `kernel gap step ${section.kernel.gap ?? density}`,
  }));
  // Vertical rhythm is page-level, never per-section invention. Chrome (nav,
  // footer) sits tight; content sections breathe.
  if (section.role !== "nav" && section.role !== "footer") {
    decls.push(prov.note(sel, "padding-block", `var(${RHYTHM_TOKENS[pageDensity]})`, {
      kind: "token", token: RHYTHM_TOKENS[pageDensity], reason: `page rhythm ${pageDensity}`,
    }));
  } else {
    decls.push(prov.note(sel, "padding-block", space(1), {
      kind: "token-step", token: SPACE_STEP_TOKENS[1], reason: "chrome rhythm",
    }));
  }

  if (section.kernel.kind === "stack") {
    decls.push(prov.note(sel, "grid-template-columns", `repeat(${GRID_TRACKS}, minmax(0, 1fr))`, {
      kind: "structure", reason: "stack occupies the 12-track field",
    }));
    decls.push(prov.note(sel, "justify-items", section.kernel.align, {
      kind: "enum", reason: `stack align=${section.kernel.align}`,
    }));
    // A media figure has no intrinsic inline size once its container is
    // shrink-to-fit, so justify-items:start collapses it to zero width.
    // Media always stretches unless a constraint says otherwise.
    if (section.slots.some((slot) => slot.name === "media")) {
      const mediaSel = slotSelector(section.id, "media");
      const explicit = section.constraints.some(
        (c) => c.type === "align" && c.slot === "media" && c.axis === "inline"
      );
      if (!explicit) {
        decls.push(`}\n${mediaSel} {\n  ` + prov.note(mediaSel, "justify-self", "stretch", {
          kind: "structure", reason: "media has no intrinsic inline size in a shrink-to-fit track",
        }));
      }
    }
  } else if (section.kernel.kind === "split") {
    const [a, b] = RATIO_TRACKS[section.kernel.ratio];
    decls.push(prov.note(sel, "grid-template-columns", `${a}fr ${b}fr`, {
      kind: "structure", reason: `split ratio ${section.kernel.ratio}`,
    }));
  } else {
    decls.push(prov.note(sel, "grid-template-columns",
      `repeat(${section.kernel.columns}, minmax(0, 1fr))`, {
        kind: "structure", reason: `grid columns ${section.kernel.columns}`,
      }));
  }

  // Explicit row placement. Column spans alone let two slots auto-place into
  // the SAME implicit row, which collapses a media figure to the height of the
  // button beside it.
  //
  // General rule, no case-specific branches:
  //   slots that share a column start stack in declaration order;
  //   a column occupied by a single slot spans the whole block.
  const spanOf = (slotName) =>
    section.constraints.find(
      (c) => c.type === "span" && c.slot === slotName && (c.at ?? "desktop") === "desktop"
    );

  const rowRules = [];
  let nextImplicitRow = 1;
  for (const slot of section.slots) {
    const span = spanOf(slot.name);
    const s = slotSelector(section.id, slot.name);
    // Declared row wins. Otherwise the slot takes the next row in declaration
    // order — never auto-placement, which is what shared a row with the media.
    const row = span?.row ?? nextImplicitRow++;
    const value = span?.rowSpan ? `${row} / span ${span.rowSpan}` : String(row);
    rowRules.push(`${s} {\n  ${prov.note(s, "grid-row", value, {
      kind: "structure",
      reason: span?.row ? `declared row ${row}` : `implicit row ${row} in declaration order`,
    })}\n}`);
  }

  // An `items` collection is one grid child. Without this it renders as a
  // single stacked column no matter what the kernel says — the collection
  // must inherit the kernel's column count.
  const itemsSel = slotSelector(section.id, "items");
  const itemColumns = section.kernel.kind === "grid" ? section.kernel.columns : 1;
  const itemsDecls = [
    prov.note(itemsSel, "display", "grid", { kind: "structure", reason: "collection inherits kernel" }),
    prov.note(itemsSel, "grid-template-columns",
      `repeat(${itemColumns}, minmax(0, 1fr))`, {
        kind: "structure", reason: `collection columns ${itemColumns}`,
      }),
    prov.note(itemsSel, "gap", gap, {
      kind: "token-step", token: SPACE_STEP_TOKENS[section.kernel.gap ?? density],
      reason: "collection gap matches kernel",
    }),
  ];

  return [
    `${sel} {\n  ${decls.join("\n  ")}\n}`,
    ...rowRules,
    `${itemsSel} {\n  ${itemsDecls.join("\n  ")}\n}`,
  ].join("\n");
}

function surfaceCss(section, prov) {
  const sel = sectionSelector(section.id);
  const bg = SURFACE_TOKENS[section.surface];
  const ink = SURFACE_INK[section.surface];
  const muted = SURFACE_INK_MUTED[section.surface];
  const decls = [
    prov.note(sel, "background", `var(${bg})`, { kind: "token", token: bg, reason: `surface ${section.surface}` }),
    prov.note(sel, "color", `var(${ink})`, { kind: "token", token: ink, reason: `surface ink ${section.surface}` }),
    // Alias only — the value is a token reference, never an invented scalar.
    prov.note(sel, "--ink-muted", `var(${muted})`, {
      kind: "token-alias", token: muted, reason: `secondary ink for ${section.surface}`,
    }),
  ];
  return `${sel} {\n  ${decls.join("\n  ")}\n}`;
}

function seamCss(section, prov, pageSeam) {
  const seam = section.seam ?? pageSeam;
  const sel = sectionSelector(section.id);
  const decls = [];
  if (seam === "rule") {
    decls.push(prov.note(sel, "border-top",
      `var(--rule-hairline) solid var(--color-border)`, {
        kind: "token", token: "--rule-hairline,--color-border", reason: "seam=rule",
      }));
  } else if (seam === "band") {
    decls.push(prov.note(sel, "padding-block", space(3), {
      kind: "token-step", token: SPACE_STEP_TOKENS[3], reason: "seam=band",
    }));
  } else if (seam === "overlap") {
    decls.push(prov.note(sel, "margin-block-start", `calc(-1 * ${space(2)})`, {
      kind: "derived-step", token: SPACE_STEP_TOKENS[2], op: "negate",
      reason: "seam=overlap pulls the section up one spacing step",
    }));
    decls.push(prov.note(sel, "position", "relative", { kind: "structure", reason: "overlap needs a stacking context" }));
  }
  return decls.length ? `${sel} {\n  ${decls.join("\n  ")}\n}` : "";
}

/** Constraints compile per breakpoint. Every one targets a semantic slot. */
function constraintCss(section, prov) {
  const buckets = { desktop: [], tablet: [], mobile: [] };

  for (const c of section.constraints) {
    const at = c.at ?? "desktop";
    const sel = slotSelector(section.id, c.slot);
    if (c.type === "span") {
      buckets[at].push(`${sel} {\n  ${prov.note(sel, "grid-column", `${c.from} / ${c.to}`, {
        kind: "structure", reason: `span ${c.from}-${c.to} @${at}`, at,
      })}\n}`);
    } else if (c.type === "align") {
      const property = c.axis === "inline" ? "justify-self" : "align-self";
      buckets[at].push(`${sel} {\n  ${prov.note(sel, property, c.value, {
        kind: "enum", reason: `align ${c.axis}=${c.value} @${at}`, at,
      })}\n}`);
    } else if (c.type === "order") {
      buckets[at].push(`${sel} {\n  ${prov.note(sel, "order", String(c.index), {
        kind: "structure", reason: `explicit order @${at}`, at,
      })}\n}`);
    } else if (c.type === "bleed") {
      const decls = [];
      const value = `calc(-1 * ${space(c.step)})`;
      if (c.side === "inline-start" || c.side === "both") {
        decls.push(prov.note(sel, "margin-inline-start", value, {
          kind: "derived-step", token: SPACE_STEP_TOKENS[c.step], op: "negate",
          reason: `bleed start step ${c.step} @${at}`, at,
        }));
      }
      if (c.side === "inline-end" || c.side === "both") {
        decls.push(prov.note(sel, "margin-inline-end", value, {
          kind: "derived-step", token: SPACE_STEP_TOKENS[c.step], op: "negate",
          reason: `bleed end step ${c.step} @${at}`, at,
        }));
      }
      buckets[at].push(`${sel} {\n  ${decls.join("\n  ")}\n}`);
    } else if (c.type === "overlap") {
      const property = c.axis === "inline" ? "margin-inline-start" : "margin-block-start";
      const decls = [
        prov.note(sel, property, `calc(-1 * ${space(c.step)})`, {
          kind: "derived-step", token: SPACE_STEP_TOKENS[c.step], op: "negate",
          reason: `overlap ${c.slot} against ${c.against} @${at}`, at,
        }),
        prov.note(sel, "position", "relative", { kind: "structure", reason: "overlap stacking", at }),
        prov.note(sel, "z-index", "1", { kind: "structure", reason: "overlap stacking", at }),
      ];
      buckets[at].push(`${sel} {\n  ${decls.join("\n  ")}\n}`);
    } else if (c.type === "measure") {
      buckets.desktop.push(`${sel} {\n  ${prov.note(sel, "max-inline-size", `var(${MEASURE_TOKENS[c.value]})`, {
        kind: "token", token: MEASURE_TOKENS[c.value], reason: `measure ${c.value}`,
      })}\n}`);
    } else if (c.type === "focalCrop") {
      const decls = [
        prov.note(sel, "object-fit", "cover", { kind: "structure", reason: "focal crop needs cover", at }),
        prov.note(sel, "object-position", `${c.x}% ${c.y}%`, {
          kind: "normalized-coordinate", reason: `focal crop @${at}`, at,
        }),
      ];
      buckets[at].push(`${sel} img, ${sel} {\n  ${decls.join("\n  ")}\n}`);
    }
  }
  return buckets;
}

function artDirectionCss(section, prov) {
  const buckets = { desktop: [], tablet: [], mobile: [] };
  for (const patch of section.artDirection) {
    const sel = slotSelector(section.id, patch.slot);
    if (patch.type === "opticalOffset") {
      const property = patch.axis === "inline" ? "margin-inline-start" : "margin-block-start";
      const magnitude = Math.abs(patch.step);
      const sign = patch.step < 0 ? "-1" : "1";
      buckets.desktop.push(`${sel} {\n  ${prov.note(sel, property,
        `calc(${sign} * ${space(magnitude)} / 4)`, {
          kind: "derived-step", token: SPACE_STEP_TOKENS[magnitude], op: "quarter-step",
          reason: `optical offset ${patch.step}`,
        })}\n}`);
    } else if (patch.type === "focalCropAdjust") {
      buckets[patch.at].push(`${sel} img, ${sel} {\n  ${prov.note(sel, "object-position",
        `${patch.x}% ${patch.y}%`, {
          kind: "normalized-coordinate", reason: `focal adjust @${patch.at}`, at: patch.at,
        })}\n}`);
    }
    // lineBreakHint is applied in HTML, not CSS.
  }
  return buckets;
}

function lineBreakHints(section) {
  const map = new Map();
  for (const patch of section.artDirection) {
    if (patch.type === "lineBreakHint") map.set(patch.slot, patch.afterWord);
  }
  return map;
}

/** Mobile collapse is compiler-owned. The program cannot express a broken
 * mobile layout because it never authors the mobile grid. */
function mobileCollapseCss(section, prov) {
  const sel = sectionSelector(section.id);
  const decls = [
    prov.note(sel, "grid-template-columns", "minmax(0, 1fr)", {
      kind: "structure", reason: "compiler-owned mobile collapse", at: "mobile",
    }),
  ];
  const slotResets = section.slots.map((slot) => {
    const s = slotSelector(section.id, slot.name);
    const lines = [
      prov.note(s, "grid-column", "auto", {
        kind: "structure", reason: "mobile collapse resets spans", at: "mobile",
      }),
      prov.note(s, "grid-row", "auto", {
        kind: "structure", reason: "mobile collapse returns to document flow", at: "mobile",
      }),
      prov.note(s, "margin-inline", "0", {
        kind: "structure", reason: "mobile collapse cancels bleed", at: "mobile",
      }),
      prov.note(s, "max-inline-size", "100%", {
        kind: "structure", reason: "mobile collapse caps measure to the viewport", at: "mobile",
      }),
    ];
    // A collection keeps its desktop column count unless it is collapsed too,
    // which is how a 3-up grid overflows a 390px viewport.
    if (slot.name === "items") {
      lines.push(prov.note(s, "grid-template-columns", "minmax(0, 1fr)", {
        kind: "structure", reason: "mobile collapse flattens collections", at: "mobile",
      }));
    }
    return `${s} {\n  ${lines.join("\n  ")}\n}`;
  });
  const reverse = section.kernel.kind === "split" && section.kernel.reverseOnMobile
    ? `${slotSelector(section.id, "media")} {\n  ${prov.note(slotSelector(section.id, "media"), "order", "-1", {
        kind: "structure", reason: "split reverseOnMobile", at: "mobile",
      })}\n}`
    : "";
  return [`${sel} {\n  ${decls.join("\n  ")}\n}`, ...slotResets, reverse]
    .filter(Boolean)
    .join("\n");
}

function resolveCopy(copy, ref) {
  if (!ref) return undefined;
  const [sectionKey, field] = ref.split(".");
  return copy?.sections?.[sectionKey]?.[field];
}

function renderSlot(section, slot, copy, hints) {
  const editId = `${section.id}.${slot.name}`;
  const attrs = `data-edit-id="${escapeHtml(editId)}"`;

  if (slot.name === "media") {
    if (!slot.assetRef) return "";
    return `      <figure class="slot slot--media" ${attrs}>\n` +
      `        <img src="${escapeHtml(slot.assetRef)}" alt="" loading="lazy" decoding="async">\n` +
      `      </figure>`;
  }

  if (slot.name === "items" && slot.collectionRef) {
    const items = copy?.collections?.[slot.collectionRef] ?? [];
    const rendered = items.map((item, index) =>
      `        <li class="item" data-edit-id="${escapeHtml(`${editId}.${index}`)}">\n` +
      `          <h3>${escapeHtml(item.title ?? "")}</h3>\n` +
      `          <p>${escapeHtml(item.body ?? "")}</p>\n` +
      `        </li>`
    ).join("\n");
    return `      <ul class="slot slot--items" ${attrs}>\n${rendered}\n      </ul>`;
  }

  if (slot.name === "actions") {
    const label = resolveCopy(copy, slot.copyRef);
    if (!label) return "";
    const href = copy?.sections?.contact?.telHref ?? "#contact";
    return `      <div class="slot slot--actions" ${attrs}>\n` +
      `        <a class="cta" href="${escapeHtml(href)}">${escapeHtml(label)}</a>\n` +
      `      </div>`;
  }

  const text = resolveCopy(copy, slot.copyRef);
  if (text === undefined) return "";

  let body = escapeHtml(text);
  const hint = hints.get(slot.name);
  if (hint) {
    const words = body.split(" ");
    if (hint < words.length) {
      body = `${words.slice(0, hint).join(" ")}<br>${words.slice(hint).join(" ")}`;
    }
  }

  const tag = slot.name === "heading"
    ? (section.role === "hero" ? "h1" : "h2")
    : slot.name === "eyebrow" ? "p" : "p";
  const cls = `slot slot--${slot.name}`;
  return `      <${tag} class="${cls}" ${attrs}>${body}</${tag}>`;
}

export function compileLayoutProgram({ program, tokens, copy }) {
  const prov = new Provenance();
  const density = DENSITY_STEP[program.page.density];

  const blocks = [];
  const media = { desktop: [], tablet: [], mobile: [] };

  // Page-level shell. Measure tokens come from the versioned layout authority
  // (layout-authority.css), never from a value the compiler invents here.
  const shellSel = ".page-shell";
  blocks.push(`${shellSel} {\n  ${[
    prov.note(shellSel, "max-inline-size", `var(${PAGE_TOKENS[program.page.measure]})`, {
      kind: "token", token: PAGE_TOKENS[program.page.measure], reason: `page canvas ${program.page.measure}`,
    }),
    prov.note(shellSel, "margin-inline", "auto", { kind: "structure", reason: "centred shell" }),
    prov.note(shellSel, "padding-inline", space(2), {
      kind: "token-step", token: SPACE_STEP_TOKENS[2], reason: "shell gutter",
    }),
  ].join("\n  ")}\n}`);

  const sectionsHtml = [];

  for (const section of program.sections) {
    blocks.push(kernelCss(section, prov, density, program.page.density));
    blocks.push(surfaceCss(section, prov));
    const seam = seamCss(section, prov, program.page.seam);
    if (seam) blocks.push(seam);

    const constraints = constraintCss(section, prov);
    const art = artDirectionCss(section, prov);
    for (const bp of ["desktop", "tablet", "mobile"]) {
      media[bp].push(...constraints[bp], ...art[bp]);
    }
    media.mobile.push(mobileCollapseCss(section, prov));

    const hints = lineBreakHints(section);
    const inner = section.slots
      .map((slot) => renderSlot(section, slot, copy, hints))
      .filter(Boolean)
      .join("\n");

    const tag = section.role === "nav" ? "header"
      : section.role === "footer" ? "footer" : "section";
    sectionsHtml.push(
      `    <${tag} data-section="${escapeHtml(section.id)}" data-role="${escapeHtml(section.role)}">\n${inner}\n    </${tag}>`
    );
  }

  const css = [
    "/* generated by spikes/layout-ir/compile.mjs — do not hand-edit */",
    ...blocks,
    ...["desktop", "tablet", "mobile"].map((bp) => {
      const body = media[bp].filter(Boolean).join("\n");
      return body ? `${breakpointQuery(bp)} {\n${body}\n}` : "";
    }),
  ].filter(Boolean).join("\n\n") + "\n";

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(copy?.sections?.nav?.logo ?? "")}</title>`,
    '  <link rel="stylesheet" href="tokens.css">',
    '  <link rel="stylesheet" href="layout-authority.css">',
    '  <link rel="stylesheet" href="chrome.css">',
    '  <link rel="stylesheet" href="layout.css">',
    "</head>",
    "<body>",
    '  <div class="page-shell">',
    ...sectionsHtml,
    "  </div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  return { html, css, provenance: prov.entries };
}
