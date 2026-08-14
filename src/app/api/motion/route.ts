import { z } from "zod";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import {
  inspectSiteMotion,
  MotionDraftSchema,
  MotionValidationError,
  mutateSiteMotion,
  previewMotionEdit,
  revertSiteMotion,
} from "../../../lib/siteMotion";
import { BlockingMutationError } from "../../../lib/siteMutation";

const RunIdSchema = z.string().regex(/^[a-z0-9_-]{4,40}$/i);
const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), runId: RunIdSchema, draft: MotionDraftSchema }).strict(),
  z.object({ action: z.literal("apply"), runId: RunIdSchema, draft: MotionDraftSchema }).strict(),
  z.object({ action: z.literal("remove"), runId: RunIdSchema, editId: z.string(), kind: z.enum(["entrance", "exit", "hover", "scroll", "timeline"]) }).strict(),
  z.object({ action: z.literal("revert"), runId: RunIdSchema }).strict(),
]);

export async function GET(request: Request) {
  if (!isLocalApiAuthorized(request)) return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  if (!RunIdSchema.safeParse(runId).success) return Response.json({ error: "bad runId" }, { status: 400 });
  try {
    return Response.json(await inspectSiteMotion(runId, url.searchParams.get("editId") ?? undefined));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "motion inspection failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalApiAuthorized(request)) return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    const body = parsed.data;
    if (body.action === "preview") return Response.json({ ok: true, draft: await previewMotionEdit(body.runId, body.draft) });
    if (body.action === "apply") return Response.json({ ok: true, ...(await mutateSiteMotion(body.runId, { action: "apply", draft: body.draft })) });
    if (body.action === "remove") return Response.json({ ok: true, ...(await mutateSiteMotion(body.runId, body)) });
    return Response.json({ ok: true, ...(await revertSiteMotion(body.runId)) });
  } catch (error) {
    if (error instanceof BlockingMutationError) return Response.json({ error: error.message, gates: error.reports }, { status: 409 });
    if (error instanceof MotionValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "motion mutation failed" }, { status: 500 });
  }
}
