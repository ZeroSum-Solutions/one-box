/**
 * The editor endpoint. Patches the PRISTINE source file by data-edit-id only
 * (audit B8) — never live-DOM outerHTML. Re-runs blocking gates after every
 * edit (audit finding: gates are invariants, not build-time stamps).
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import { EditRequestSchema, ARTIFACTS, MODELS, type DesignTokens } from "@/lib/contracts";
import { sitePaths, loadArtifact, loadRun } from "@/lib/runstate";
import { generateJson } from "@/lib/openrouter";
import { generateImage } from "@/lib/tools/higgsfield";
import { runGates } from "@/lib/gates";

export const maxDuration = 300;

export async function POST(req: Request) {
  const parsed = EditRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  const { runId, editId, instruction, imageIntent } = parsed.data;
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) {
    return Response.json({ error: "bad runId" }, { status: 400 });
  }

  const indexPath = path.join(sitePaths(runId).site, "index.html");
  let html: string;
  try {
    html = await fs.readFile(indexPath, "utf8");
  } catch {
    return Response.json({ error: "site not built" }, { status: 404 });
  }

  const $ = cheerio.load(html);
  const el = $(`[data-edit-id="${editId.replace(/"/g, "")}"]`);
  if (el.length !== 1) {
    return Response.json(
      { error: `edit id not found or ambiguous: ${editId}` },
      { status: 404 }
    );
  }

  const tokens = (await loadArtifact(runId, ARTIFACTS.tokens)) as DesignTokens;

  if (imageIntent || el.is("img")) {
    // Image swap: regenerate through the run's locked imagery brief + instruction.
    const b = tokens.imageryBrief;
    const assetName = `edit-${Date.now().toString(36)}.jpg`;
    const outPath = path.join(sitePaths(runId).site, "assets", assetName);
    const gen = await generateImage({
      prompt: `${instruction}. Stay inside this art direction — subject family: ${b.subject}; lighting: ${b.lighting}; grade: ${b.grade}; framing: ${b.framing}; avoid: ${b.avoid.join(", ")}. No text, no logos.`,
      aspectRatio: el.attr("data-aspect") ?? "16:9",
      outPath,
    });
    if ("error" in gen) {
      return Response.json({ error: `image generation failed: ${gen.error}` }, { status: 502 });
    }
    const target = el.is("img") ? el : el.find("img").first();
    if (!target.length) {
      return Response.json({ error: "no <img> under that element" }, { status: 400 });
    }
    target.attr("src", `assets/${assetName}`);
    if (!target.attr("alt")) target.attr("alt", instruction.slice(0, 100));
  } else {
    // Text/structure edit: model rewrites the fragment's inner content only.
    const fragment = $.html(el);
    const out = await generateJson(
      runId,
      MODELS.builder,
      z.object({ innerHtml: z.string() }),
      `Rewrite ONLY the inner content of this element per the instruction. Hard rules: keep every data-edit-id attribute on descendants; do not add classes, ids, inline styles, scripts, or new colors — styling comes from the site's token sheet; keep the same tag structure unless the instruction requires otherwise; return innerHtml only (no outer tag).\n\nINSTRUCTION: ${instruction}\n\nELEMENT (outer HTML for context):\n${fragment}\n\nAVAILABLE TOKENS (for reference, do not inline them): ${tokens.colors.map((c) => c.cssVar).join(", ")}`
    );
    el.html(out.innerHtml);
  }

  // Verify every script selector still resolves (audit B8) before writing.
  const scripts = $("script")
    .map((_, s) => $(s).html() ?? "")
    .get()
    .join("\n");
  const selectorRefs = [...scripts.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]
  );
  const broken = selectorRefs.filter((sel) => {
    try {
      return $(sel).length === 0;
    } catch {
      return false;
    }
  });
  if (broken.length) {
    return Response.json(
      { error: `edit would orphan script selectors: ${broken.join(", ")} — rejected` },
      { status: 409 }
    );
  }

  await fs.writeFile(indexPath, $.html());

  // Re-run blocking gates; report but never silently un-edit.
  const reports = await runGates(runId, { afterEdit: true });
  const failing = reports.filter((r) => r.blocking && !r.pass);
  const run = await loadRun(runId);

  return Response.json({
    ok: true,
    editId,
    gates: reports.map((r) => ({ gate: r.gate, pass: r.pass, blocking: r.blocking })),
    gatesClean: failing.length === 0,
    costUsd: run.costUsd,
  });
}
