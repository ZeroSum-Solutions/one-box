import { ZodError } from "zod";
import {
  ElementEditError,
  ElementMutationRequestSchema,
  applyStructuredElementEdit,
  elementHistoryState,
  elementTree,
  moveElementHistory,
} from "../../../lib/elementEditor";
import { BlockingMutationError } from "../../../lib/siteMutation";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import {
  PageIrEditRequestV1Schema,
  PageIrMutationRejectedError,
  PageIrMutationUnsupportedError,
  applyPageIrEditTransaction,
  movePageIrEditHistory,
  pageIrEditHistoryState,
  pageIrMutationsFromElementPatch,
} from "../../../lib/pageIrMutation";
import {
  assertWebsiteProductionRun,
  websiteOnlyProductionResponse,
} from "../../../lib/productionTarget";
import { loadRun } from "../../../lib/runstate";

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
    const run = await loadRun(runId);
    // tree powers the Layers/Navigator panel from the live projection;
    // history powers UndoRedoRail from the run's selected layout authority.
    const [history, tree] = await Promise.all([
      run.layoutAuthority === "page-ir-v1"
        ? pageIrEditHistoryState(runId)
        : elementHistoryState(runId),
      elementTree(runId),
    ]);
    return Response.json({ ...history, tree });
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
    if (!/^[a-z0-9_-]{4,40}$/i.test(body.runId)) {
      return Response.json({ error: "bad runId" }, { status: 400 });
    }
    await assertWebsiteProductionRun(body.runId);
    const run = await loadRun(body.runId);
    const result = run.layoutAuthority === "page-ir-v1"
      ? body.action === "apply"
        ? await applyPageIrEditTransaction(
            PageIrEditRequestV1Schema.parse({
              schemaVersion: 1,
              runId: body.runId,
              mutations: pageIrMutationsFromElementPatch(
                body.editId,
                body.patch,
              ),
            }),
          )
        : await movePageIrEditHistory(body.runId, body.action)
      : body.action === "apply"
        ? await applyStructuredElementEdit(body.runId, body.editId, body.patch)
        : await moveElementHistory(body.runId, body.action);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const targetResponse = websiteOnlyProductionResponse(error);
    if (targetResponse) return targetResponse;
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
    if (error instanceof PageIrMutationRejectedError) {
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
    if (error instanceof PageIrMutationUnsupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ElementEditError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "element edit failed" }, { status: 500 });
  }
}
