/**
 * The editor endpoint. Patches the PRISTINE source file by data-edit-id only
 * (audit B8) — never live-DOM outerHTML. Re-runs blocking gates after every
 * edit (audit finding: gates are invariants, not build-time stamps).
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
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
  readImageGenerationLedger,
  reserveImageGeneration,
} from "../../../lib/imageGenerationBudget";
import { applyElementHtmlEdit, ElementEditError } from "../../../lib/elementEditor";
import {
  knownMutationGateRequest,
  unknownMutationGateRequest,
} from "../../../lib/mutationGateMatrix";
import {
  assertImageGenerationRequestId,
  GeneratedImageValidationError,
  IMAGE_GENERATION_STALE_MS,
  ImageLibraryError,
  listProjectImages,
  prepareGeneratedImageStagingPath,
  readValidatedGeneratedLiveImage,
  readValidatedGeneratedImageStaging,
  type ValidatedGeneratedImageFile,
} from "../../../lib/imageLibrary";
import { describeTokensForEdit } from "../../../lib/editorPromptContext";
import {
  atomicWriteGeneratedSiteFile,
  BlockingMutationError,
  withSiteAuthorityLock,
} from "../../../lib/siteMutation";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import { classifyEditInstruction } from "../../../lib/editPreflight";
import {
  assertWebsiteProductionRun,
  websiteOnlyProductionResponse,
} from "../../../lib/productionTarget";

export const maxDuration = 300;
const INTERRUPTED_INLINE_GENERATION_ERROR =
  "Image generation was interrupted before completion; retry with a new request id.";

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

async function readPreflightImageTarget(runId: string, editId: string) {
  const html = await readFile(path.join(sitePaths(runId).site, "index.html"), "utf8");
  const $ = cheerio.load(html);
  const element = $("[data-edit-id]").filter(
    (_, candidate) => $(candidate).attr("data-edit-id") === editId,
  );
  if (element.length !== 1) {
    throw new ElementEditError(
      `edit id not found or ambiguous: ${editId}`,
      404,
    );
  }
  const target = element.is("img") ? element : element.find("img").first();
  if (!target.length) {
    throw new ElementEditError("no <img> under that element");
  }
  return { aspectRatio: element.attr("data-aspect") ?? "16:9" };
}

async function removeStagingFile(filePath: string) {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function finishInlineImageGeneration(
  runId: string,
  runRoot: string,
  ledgerPath: string,
  requestId: string,
  status: "completed" | "failed",
  error?: string,
) {
  await withSiteAuthorityLock(
    runId,
    () =>
      finishImageGeneration(
        ledgerPath,
        requestId,
        status,
        error,
      ),
    { runRoot },
  );
}

async function readGeneratedImageForReplay(
  runId: string,
  requestId: string,
): Promise<{ image: ValidatedGeneratedImageFile; fromLive: boolean }> {
  try {
    return {
      image: await readValidatedGeneratedImageStaging(runId, requestId),
      fromLive: false,
    };
  } catch (error) {
    if (
      !(error instanceof GeneratedImageValidationError) ||
      error.reason !== "missing"
    ) {
      throw error;
    }
  }
  return {
    image: await readValidatedGeneratedLiveImage(runId, requestId),
    fromLive: true,
  };
}

async function imageTargetUsesSource(
  runId: string,
  editId: string,
  source: string,
) {
  const html = await readFile(path.join(sitePaths(runId).site, "index.html"), "utf8");
  const $ = cheerio.load(html);
  const element = $("[data-edit-id]").filter(
    (_, candidate) => $(candidate).attr("data-edit-id") === editId,
  );
  if (element.length !== 1) return false;
  const target = element.is("img") ? element : element.find("img").first();
  return target.length === 1 && target.attr("src") === source;
}

export async function POST(req: Request) {
  if (!isLocalApiAuthorized(req)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  const parsed = EditRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  const {
    runId,
    editId,
    instruction,
    imageIntent,
    requestId,
    confirmRedirect,
    referenceAssetId,
  } = parsed.data;
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) {
    return Response.json({ error: "bad runId" }, { status: 400 });
  }
  try {
    await assertWebsiteProductionRun(runId);
  } catch (error) {
    const response = websiteOnlyProductionResponse(error);
    if (response) return response;
    throw error;
  }
  if ((await loadRun(runId)).layoutAuthority === "page-ir-v1") {
    return Response.json(
      {
        code: "unsupported-page-ir-capability",
        error: "Arbitrary HTML and image-instruction edits are not represented by Page IR v1",
      },
      { status: 409 },
    );
  }

  const tokens = (await loadArtifact(runId, ARTIFACTS.tokens)) as DesignTokens;
  let preflightElement: Awaited<ReturnType<typeof readPreflightElementContext>>;
  if (!imageIntent) {
    // Each context source degrades independently (review finding): a digest
    // read failure must not skip classification, and only the classifier
    // itself is allowed to fail open.
    try {
      preflightElement = await readPreflightElementContext(runId, editId);
    } catch (error) {
      console.warn(
        `[edit-preflight] run ${runId}: unable to read edit context; applying edit through deterministic gates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (preflightElement && preflightElement.elementTag !== "img") {
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
        ...preflightElement,
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
  const paths = sitePaths(runId);
  const generationLedgerPath = path.join(
    paths.root,
    "image-generation-ledger.json",
  );
  let imageCredits: { used: number; cap: number } | undefined;
  let generatedImage: ValidatedGeneratedImageFile | undefined;
  let replayedFromLiveImage = false;
  try {
    // Play 11 (canvas-upgrade B3): a referenceAssetId is an id, never trusted
    // on its own — it is resolved against THIS run's own image library
    // before it can influence anything, the same validate-against-own-
    // library convention imageLibrary.ts already uses for sourceAssetId.
    // Resolved here, before applyElementHtmlEdit takes the run's site-
    // authority lock, because listProjectImages takes that same lock itself
    // (withImageAuthority) and the two are not reentrant.
    let referenceItem:
      | Awaited<ReturnType<typeof listProjectImages>>["items"][number]
      | null = null;
    if (imageIntent && referenceAssetId) {
      const library = await listProjectImages(runId).catch(() => {
        throw new ElementEditError("reference image library unavailable", 502);
      });
      referenceItem =
        library.items.find((item) => item.id === referenceAssetId) ?? null;
      if (!referenceItem || referenceItem.status !== "completed") {
        throw new ElementEditError(
          "reference image not found or not ready",
          404,
        );
      }
    }
    const inlineImageRequested =
      imageIntent || preflightElement?.elementTag === "img";
    if (inlineImageRequested) {
      if (!requestId) {
        throw new ElementEditError(
          "image generation requires an idempotency requestId",
          400,
        );
      }
      assertImageGenerationRequestId(requestId);
      const preflightTarget = await readPreflightImageTarget(runId, editId);
      let stagingPath = path.join(
        paths.root,
        "image-staging",
        `${requestId}.download`,
      );
      const b = tokens.imageryBrief;
      const referenceClause = referenceItem?.prompt
        ? ` Match the visual style of this earlier generated image: "${referenceItem.prompt}".`
        : "";
      const generationOptions = {
        prompt: `${instruction}. Stay inside this art direction — subject family: ${b.subject}; lighting: ${b.lighting}; grade: ${b.grade}; framing: ${b.framing}; avoid: ${b.avoid.join(", ")}.${referenceClause} No text, no logos.`,
        aspectRatio: preflightTarget.aspectRatio,
        outPath: stagingPath,
      };
      // The durable ledger reservation is the cross-process first-caller
      // claim. Read, free credit preflight, and reserve share one site-authority
      // transaction; only the creator proceeds to the paid provider call.
      const claim = await withSiteAuthorityLock(
        runId,
        async (authority) => {
          const ledger = await readImageGenerationLedger(generationLedgerPath);
          const existing = ledger.entries.find(
            (entry) => entry.requestId === requestId,
          );
          if (existing) {
            return { kind: "existing" as const, ledger, existing };
          }
          if (authority?.runRoot) {
            stagingPath = await prepareGeneratedImageStagingPath(
              authority.runRoot,
              requestId,
            );
            generationOptions.outPath = stagingPath;
          }
          const estimate = await estimateImageCredits(generationOptions);
          if (typeof estimate !== "number") {
            throw new ElementEditError(estimate.error, 502);
          }
          const reservation = await reserveImageGeneration(
            generationLedgerPath,
            {
              requestId,
              editId,
              instruction,
              credits: estimate,
            },
          );
          return { kind: "created" as const, reservation };
        },
        { runRoot: paths.root },
      );
      const replayingCompleted =
        claim.kind === "existing" && claim.existing.status === "completed";
      if (claim.kind === "existing") {
        const { existing, ledger } = claim;
        const instructionSha256 = createHash("sha256")
          .update(instruction)
          .digest("hex");
        if (
          existing.editId !== editId ||
          existing.instructionSha256 !== instructionSha256
        ) {
          throw new ElementEditError(
            "this image request id was already used with a different payload",
            409,
          );
        }
        imageCredits = {
          used: ledger.entries.reduce(
            (total, entry) => total + entry.credits,
            0,
          ),
          cap: ledger.capCredits,
        };
        if (existing.status === "failed") {
          throw new ElementEditError(
            `image generation failed: ${existing.error ?? "provider request failed"}`,
            502,
          );
        }
        if (existing.status === "reserved") {
          const reservedAt = Date.parse(existing.reservedAt);
          if (
            Number.isFinite(reservedAt) &&
            Date.now() - reservedAt < IMAGE_GENERATION_STALE_MS
          ) {
            throw new ElementEditError(
              "image generation is still in progress; retry this request",
              409,
            );
          }
          try {
            const recovered = await readGeneratedImageForReplay(
              runId,
              requestId,
            );
            generatedImage = recovered.image;
            replayedFromLiveImage = recovered.fromLive;
          } catch (error) {
            const missing =
              error instanceof GeneratedImageValidationError &&
              error.reason === "missing";
            const failure = missing
              ? INTERRUPTED_INLINE_GENERATION_ERROR
              : error instanceof Error
                ? error.message
                : "paid image output is invalid";
            await finishInlineImageGeneration(
              runId,
              paths.root,
              generationLedgerPath,
              requestId,
              "failed",
              failure,
            );
            if (missing) {
              throw new ElementEditError(
                `image generation failed: ${failure}`,
                502,
              );
            }
            throw error;
          }
          await finishInlineImageGeneration(
            runId,
            paths.root,
            generationLedgerPath,
            requestId,
            "completed",
          );
        }
      } else if (claim.kind === "created") {
        imageCredits = {
          used: claim.reservation.usedCredits,
          cap: claim.reservation.capCredits,
        };
        await removeStagingFile(stagingPath);
        const generated = await generateImage(generationOptions);
        if ("error" in generated) {
          await withSiteAuthorityLock(
            runId,
            () =>
              finishImageGeneration(
                generationLedgerPath,
                requestId,
                "failed",
                generated.error,
              ),
            { runRoot: paths.root },
          );
          await removeStagingFile(stagingPath);
          throw new ElementEditError(
            `image generation failed: ${generated.error}`,
            502,
          );
        }
        // Paid provider completion is operational truth even if staging is
        // malformed or the subsequent guarded site mutation is rejected.
        await withSiteAuthorityLock(
          runId,
          () =>
            finishImageGeneration(
              generationLedgerPath,
              requestId,
              "completed",
            ),
          { runRoot: paths.root },
        );
      }
      if (!generatedImage) {
        if (replayingCompleted) {
          const replay = await readGeneratedImageForReplay(runId, requestId);
          generatedImage = replay.image;
          replayedFromLiveImage = replay.fromLive;
        } else {
          generatedImage = await readValidatedGeneratedImageStaging(
            runId,
            requestId,
          );
        }
      }
    }
    if (
      generatedImage &&
      replayedFromLiveImage &&
      (await withSiteAuthorityLock(
        runId,
        () => imageTargetUsesSource(runId, editId, generatedImage!.relativePath),
        { runRoot: paths.root },
      ))
    ) {
      const run = await loadRun(runId);
      return Response.json({
        ok: true,
        editId,
        gates: [],
        gatesClean: true,
        costUsd: run.costUsd,
        imageCredits,
      });
    }
    let imageAlreadyApplied = false;
    let mutation: Awaited<ReturnType<typeof applyElementHtmlEdit>>;
    try {
      mutation = await applyElementHtmlEdit(
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
          if (!generatedImage && el.is("img")) {
            throw new ElementEditError(
              "image target preflight was unavailable; retry the edit",
              409,
            );
          }

          if (generatedImage) {
            // Revalidate under the guarded mutation because the target may have
            // changed while the provider ran outside site authority.
            const target = el.is("img") ? el : el.find("img").first();
            if (!target.length) {
              throw new ElementEditError("no <img> under that element");
            }
            if (target.attr("src") === generatedImage.relativePath) {
              imageAlreadyApplied = true;
              return html;
            }
            await atomicWriteGeneratedSiteFile(
              runId,
              generatedImage.finalPath,
              generatedImage.buffer,
            );
            target.attr("src", generatedImage.relativePath);
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
        {
          snapshotPaths: generatedImage ? [generatedImage.finalPath] : [],
          gateRequest: generatedImage
            ? knownMutationGateRequest("asset")
            : unknownMutationGateRequest(),
        },
      );
    } catch (error) {
      if (
        imageAlreadyApplied &&
        generatedImage &&
        error instanceof ElementEditError &&
        error.status === 409 &&
        error.message === "edit did not change the selected element"
      ) {
        if ("stagingPath" in generatedImage) {
          await removeStagingFile(generatedImage.stagingPath as string);
        }
        const run = await loadRun(runId);
        return Response.json({
          ok: true,
          editId,
          gates: [],
          gatesClean: true,
          costUsd: run.costUsd,
          imageCredits,
        });
      }
      throw error;
    }
    if (generatedImage && "stagingPath" in generatedImage) {
      await removeStagingFile(generatedImage.stagingPath as string);
    }
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
    if (error instanceof ImageLibraryError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
