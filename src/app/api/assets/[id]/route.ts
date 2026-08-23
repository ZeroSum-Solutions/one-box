import { ZodError } from "zod";
import { ElementEditError } from "../../../../lib/elementEditor";
import {
  AssetMutationRequestSchema,
  IMAGE_MODELS,
  ImageLibraryError,
  assetPublicUrl,
  generateProjectImage,
  listProjectImages,
  placeLibraryImage,
  type ImageLibrary,
} from "../../../../lib/imageLibrary";
import { ImageGenerationBudgetError } from "../../../../lib/imageGenerationBudget";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import { BlockingMutationError } from "../../../../lib/siteMutation";
import {
  assertWebsiteProductionRun,
  websiteOnlyProductionResponse,
} from "../../../../lib/productionTarget";

export const maxDuration = 300;

function serializeLibrary(runId: string, library: ImageLibrary) {
  return {
    ...library,
    items: library.items.map((item) => ({
      ...item,
      url: assetPublicUrl(runId, item),
    })),
  };
}

function errorResponse(error: unknown) {
  const targetResponse = websiteOnlyProductionResponse(error);
  if (targetResponse) return targetResponse;
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }
  if (error instanceof ImageLibraryError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ImageGenerationBudgetError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ElementEditError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof BlockingMutationError) {
    return Response.json(
      {
        error: error.message,
        gates: error.reports.map((report) => ({
          gate: report.gate,
          pass: report.pass,
          blocking: report.blocking,
        })),
      },
      { status: 409 },
    );
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "asset action failed" },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json(
      { error: "Unauthorized local API request" },
      { status: 403 },
    );
  }
  try {
    const { id } = await context.params;
    const library = await listProjectImages(id);
    return Response.json({
      models: IMAGE_MODELS,
      library: serializeLibrary(id, library),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json(
      { error: "Unauthorized local API request" },
      { status: 403 },
    );
  }
  try {
    const { id } = await context.params;
    if (!/^[a-z0-9_-]{4,40}$/i.test(id)) {
      return Response.json({ error: "bad run id" }, { status: 400 });
    }
    const body = AssetMutationRequestSchema.parse(await request.json());
    await assertWebsiteProductionRun(id);

    if (body.action === "place") {
      const result = await placeLibraryImage(id, body.assetId, body.editId);
      return Response.json({
        ok: true,
        action: "place",
        item: { ...result.item, url: assetPublicUrl(id, result.item) },
        gates: result.gates.map((report) => ({
          gate: report.gate,
          pass: report.pass,
          blocking: report.blocking,
        })),
      });
    }

    if (body.action === "regenerate") {
      const library = await listProjectImages(id);
      const source = library.items.find((item) => item.id === body.assetId);
      if (!source) throw new ImageLibraryError("source image not found", 404);
      const prompt = body.prompt?.trim() || source.prompt?.trim();
      if (!prompt) {
        throw new ImageLibraryError(
          "This existing image has no saved prompt. Add a prompt before regenerating.",
          400,
        );
      }
      const result = await generateProjectImage({
        runId: id,
        requestId: body.requestId,
        prompt,
        model: body.model ?? IMAGE_MODELS[0].id,
        aspectRatio:
          body.aspectRatio ??
          (IMAGE_MODELS[0].aspectRatios.includes(
            source.aspectRatio as (typeof IMAGE_MODELS)[0]["aspectRatios"][number],
          )
            ? (source.aspectRatio as (typeof IMAGE_MODELS)[0]["aspectRatios"][number])
            : "1:1"),
        quality: body.quality ?? source.quality ?? "high",
        meteredConsent: body.meteredConsent,
        sourceAssetId: source.id,
        targetEditId: source.source.targetEditId ?? undefined,
      });
      return Response.json({
        ok: true,
        action: "regenerate",
        item: { ...result.item, url: assetPublicUrl(id, result.item) },
        library: serializeLibrary(id, result.library),
      });
    }

    const result = await generateProjectImage({
      runId: id,
      requestId: body.requestId,
      prompt: body.prompt,
      model: body.model,
      aspectRatio: body.aspectRatio,
      quality: body.quality,
      meteredConsent: body.meteredConsent,
      sourceAssetId: body.sourceAssetId,
      targetEditId: body.targetEditId,
    });
    return Response.json({
      ok: true,
      action: "generate",
      item: { ...result.item, url: assetPublicUrl(id, result.item) },
      library: serializeLibrary(id, result.library),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
