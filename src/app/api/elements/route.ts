import { ZodError } from "zod";
import {
  ElementEditError,
  ElementMutationRequestSchema,
  applyStructuredElementEdit,
  elementHistoryState,
  moveElementHistory,
} from "../../../lib/elementEditor";
import { BlockingMutationError } from "../../../lib/siteMutation";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  try {
    const runId = new URL(request.url).searchParams.get("runId") ?? "";
    if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) {
      return Response.json({ error: "bad runId" }, { status: 400 });
    }
    return Response.json(await elementHistoryState(runId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "history unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  try {
    const body = ElementMutationRequestSchema.parse(await request.json());
    const result =
      body.action === "apply"
        ? await applyStructuredElementEdit(body.runId, body.editId, body.patch)
        : await moveElementHistory(body.runId, body.action);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
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
        { status: 409 }
      );
    }
    if (error instanceof ElementEditError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "element edit failed" }, { status: 500 });
  }
}
