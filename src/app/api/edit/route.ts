/**
 * The editor endpoint. Patches the PRISTINE source file by data-edit-id only
 * (audit B8) — never live-DOM outerHTML. Re-runs blocking gates after every
 * edit (audit finding: gates are invariants, not build-time stamps).
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { z } from "zod";
import {
  EditRequestSchema,
  ARTIFACTS,
  MODELS,
  type DesignTokens,
  ReferenceStyleDigestSchema,
} from "../../../lib/contracts";
import { sitePaths, loadArtifact, loadRun } from "../../../lib/runstate";
import { generateJson } from "../../../lib/openrouter";
import {
  estimateImageCredits,
  generateImage,
} from "../../../lib/tools/higgsfield";
import {
  ImageGenerationBudgetError,
  finishImageGeneration,
  reserveImageGeneration,
} from "../../../lib/imageGenerationBudget";
import { applyElementHtmlEdit, ElementEditError } from "../../../lib/elementEditor";
import { describeTokensForEdit } from "../../../lib/editorPromptContext";
import { BlockingMutationError } from "../../../lib/siteMutation";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import { classifyEditInstruction } from "../../../lib/editPreflight";

export const maxDuration = 300;

async function readPreflightElementContext(runId: string, editId: string) {
  const html = await readFile(path.join(sitePaths(runId).site, "index.html"), "utf8");
  const $ = cheerio.load(html);
  const element = $("[data-edit-id]").filter(
    (_, candidate) => $(candidate).attr("data-edit-id") === editId,
  );
  if (element.length !== 1) return undefined;
  return {
    elementTag: element[0].tagName.toLowerCase(),
    elementRole: element.attr("role") || undefined,
  };
}

export async function POST(req: Request) {
  if (!isLocalApiAuthorized(req)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  const parsed = EditRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  const { runId, editId, instruction, imageIntent, requestId, confirmRedirect } = parsed.data;
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) {
    return Response.json({ error: "bad runId" }, { status: 400 });
  }

  const tokens = (await loadArtifact(runId, ARTIFACTS.tokens)) as DesignTokens;
  if (!imageIntent) {
    // Each context source degrades independently (review finding): a digest
    // read failure must not skip classification, and only the classifier
    // itself is allowed to fail open.
    let element: Awaited<ReturnType<typeof readPreflightElementContext>>;
    try {
      element = await readPreflightElementContext(runId, editId);
    } catch (error) {
      console.warn(
        `[edit-preflight] run ${runId}: unable to read edit context; applying edit through deterministic gates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (element && element.elementTag !== "img") {
      let digestData;
      try {
        const digest = ReferenceStyleDigestSchema.safeParse(
          await loadArtifact(runId, ARTIFACTS.referenceStyleDigest),
        );
        digestData = digest.success ? digest.data : undefined;
      } catch (error) {
        console.warn(
          `[edit-preflight] run ${runId}: style digest unavailable; classifying without it: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const classification = await classifyEditInstruction(runId, {
        instruction,
        ...element,
        tokens,
        ...(digestData ? { digest: digestData } : {}),
      });
      if (classification.decision === "refuse") {
        return Response.json({ ok: false, guardrail: classification });
      }
      if (classification.decision === "redirect" && !confirmRedirect) {
        return Response.json({ ok: false, guardrail: classification });
      }
    }
  }
  const assetName = `edit-${randomUUID()}.jpg`;
  const outPath = path.join(sitePaths(runId).site, "assets", assetName);
  const generationLedgerPath = path.join(
    sitePaths(runId).root,
    "image-generation-ledger.json",
  );
  let imageCredits: { used: number; cap: number } | undefined;
  try {
    const mutation = await applyElementHtmlEdit(
      runId,
      editId,
      async (html) => {
        const $ = cheerio.load(html);
        const el = $("[data-edit-id]").filter(
          (_, element) => $(element).attr("data-edit-id") === editId,
        );
        if (el.length !== 1)
          throw new ElementEditError(
            `edit id not found or ambiguous: ${editId}`,
            404,
          );

        if (imageIntent || el.is("img")) {
          // Image swap: resolve + validate the target BEFORE the paid generation
          // (audit P2: a bad selection must cost nothing and write nothing).
          const target = el.is("img") ? el : el.find("img").first();
          if (!target.length) {
            throw new ElementEditError("no <img> under that element");
          }
          if (!requestId) {
            throw new ElementEditError(
              "image generation requires an idempotency requestId",
              400,
            );
          }
          const b = tokens.imageryBrief;
          const generationOptions = {
            prompt: `${instruction}. Stay inside this art direction — subject family: ${b.subject}; lighting: ${b.lighting}; grade: ${b.grade}; framing: ${b.framing}; avoid: ${b.avoid.join(", ")}. No text, no logos.`,
            aspectRatio: el.attr("data-aspect") ?? "16:9",
            outPath,
          };
          const estimate = await estimateImageCredits(generationOptions);
          if (typeof estimate !== "number") {
            throw new ElementEditError(estimate.error, 502);
          }
          const reservation = await reserveImageGeneration(
            generationLedgerPath,
            { requestId, editId, instruction, credits: estimate },
          );
          imageCredits = {
            used: reservation.usedCredits,
            cap: reservation.capCredits,
          };
          const gen = await generateImage(generationOptions);
          if ("error" in gen) {
            await finishImageGeneration(
              generationLedgerPath,
              requestId,
              "failed",
              gen.error,
            );
            throw new ElementEditError(
              `image generation failed: ${gen.error}`,
              502,
            );
          }
          await finishImageGeneration(
            generationLedgerPath,
            requestId,
            "completed",
          );
          target.attr("src", `assets/${assetName}`);
          if (!target.attr("alt"))
            target.attr("alt", instruction.slice(0, 100));
        } else {
          // Text/structure edit: model rewrites the fragment's inner content only.
          const fragment = $.html(el);
          const idsBefore = el
            .find("[data-edit-id]")
            .map((_, d) => $(d).attr("data-edit-id") ?? "")
            .get()
            .filter(Boolean);
          const out = await generateJson(
            runId,
            MODELS.builder,
            z.object({ innerHtml: z.string() }),
            `Rewrite ONLY the inner content of this element per the instruction. Hard rules: keep every data-edit-id attribute on descendants; do not add classes, ids, inline styles, scripts, or new colors — styling comes from the site's token sheet; keep the same tag structure unless the instruction requires otherwise; return innerHtml only (no outer tag).\n\nINSTRUCTION: ${instruction}\n\nELEMENT (outer HTML for context):\n${fragment}\n\nAVAILABLE TOKENS (for reference, do not inline them):\n${describeTokensForEdit(tokens)}`,
          );
          el.html(out.innerHtml);
          // Descendant edit-ids are the editor's address space — losing one makes
          // that node permanently uneditable (audit P2). Reject any loss.
          const idsAfter = new Set(
            el
              .find("[data-edit-id]")
              .map((_, d) => $(d).attr("data-edit-id") ?? "")
              .get(),
          );
          const lost = idsBefore.filter((id) => !idsAfter.has(id));
          if (lost.length) {
            throw new ElementEditError(
              `edit would remove editable elements (${lost.join(", ")}) — rejected; try a narrower instruction`,
              409,
            );
          }
        }

        // Verify every script selector still resolves (audit B8) before writing.
        const scripts = $("script")
          .map((_, s) => $(s).html() ?? "")
          .get()
          .join("\n");
        const selectorRefs = [
          ...scripts.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]/g),
        ].map((m) => m[1]);
        const broken = selectorRefs.filter((sel) => {
          try {
            return $(sel).length === 0;
          } catch {
            return false;
          }
        });
        if (broken.length) {
          throw new ElementEditError(
            `edit would orphan script selectors: ${broken.join(", ")} — rejected`,
            409,
          );
        }
        return $.html();
      },
      { snapshotPaths: [outPath] },
    );
    const run = await loadRun(runId);

    return Response.json({
      ok: true,
      editId,
      gates: mutation.gates.map((r) => ({
        gate: r.gate,
        pass: r.pass,
        blocking: r.blocking,
      })),
      gatesClean: true,
      costUsd: run.costUsd,
      imageCredits,
    });
  } catch (error) {
    if (error instanceof BlockingMutationError) {
      return Response.json(
        { error: error.message, gates: error.reports },
        { status: 409 },
      );
    }
    if (error instanceof ElementEditError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ImageGenerationBudgetError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
