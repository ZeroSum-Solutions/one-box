import { z } from "zod";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import {
  applyTokenEdit,
  inspectSiteTokens,
  previewTokenEdit,
  revertTokenEdit,
  TokenValidationError,
} from "../../../lib/siteTokens";
import { BlockingMutationError } from "../../../lib/siteMutation";

const RunIdSchema = z.string().regex(/^[a-z0-9_-]{4,40}$/i);
const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), runId: RunIdSchema, token: z.string(), value: z.string().max(100) }).strict(),
  z.object({ action: z.literal("apply"), runId: RunIdSchema, token: z.string(), value: z.string().max(100) }).strict(),
  z.object({ action: z.literal("revert"), runId: RunIdSchema }).strict(),
]);

export async function GET(request: Request) {
  if (!isLocalApiAuthorized(request)) return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (!RunIdSchema.safeParse(runId).success) return Response.json({ error: "bad runId" }, { status: 400 });
  try {
    return Response.json(await inspectSiteTokens(runId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "token inspection failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalApiAuthorized(request)) return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    const body = parsed.data;
    if (body.action === "preview") return Response.json({ ok: true, ...(await previewTokenEdit(body.runId, body.token, body.value)) });
    if (body.action === "apply") return Response.json({ ok: true, ...(await applyTokenEdit(body.runId, body.token, body.value)) });
    return Response.json({ ok: true, ...(await revertTokenEdit(body.runId)) });
  } catch (error) {
    if (error instanceof BlockingMutationError) return Response.json({ error: error.message, gates: error.reports }, { status: 409 });
    if (error instanceof TokenValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "token mutation failed" }, { status: 500 });
  }
}
