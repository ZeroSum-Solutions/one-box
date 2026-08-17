import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AssistantScopeNotFoundError,
  AssistantUnavailableError,
  loadEditorThread,
  runAssistantTurn,
} from "../../../../lib/assistant";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import { RunNotFoundError, loadRun, sitePaths } from "../../../../lib/runstate";

export const maxDuration = 300;

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;
// Same editId shape enforced everywhere an editId crosses a boundary
// (elementEditor.ts, imageLibrary.ts, siteMotion.ts).
const EDIT_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/i;
const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  // Optional selection scope (canvas-upgrade Wave 6, Play 5): an editId,
  // never trusted on its own. Format-checked here at the boundary exactly
  // like every other editId field; whether it actually exists in THIS run's
  // own live site inventory can only be known once the site HTML is loaded,
  // so that check happens inside runAssistantTurn and surfaces as
  // AssistantScopeNotFoundError below.
  scopeEditId: z.string().regex(EDIT_ID).optional(),
});

async function assertAssistantAvailable(runId: string): Promise<void> {
  await loadRun(runId);
  try {
    await access(path.join(sitePaths(runId).site, "index.html"));
  } catch {
    throw new AssistantUnavailableError();
  }
}

function unavailableResponse(error: unknown): Response | undefined {
  if (error instanceof RunNotFoundError) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }
  if (error instanceof AssistantUnavailableError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof AssistantScopeNotFoundError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await assertAssistantAvailable(id);
    return Response.json({ runId: id, thread: await loadEditorThread(id) });
  } catch (error) {
    const response = unavailableResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "text must be between 1 and 2000 characters, and a selection scope must be a valid element id" },
      { status: 400 },
    );
  }
  try {
    await assertAssistantAvailable(id);
    return Response.json({
      runId: id,
      thread: await runAssistantTurn(id, parsed.data.text, parsed.data.scopeEditId),
    });
  } catch (error) {
    const response = unavailableResponse(error);
    if (response) return response;
    // A same-text retry within two minutes resumes a persisted pending turn
    // instead of duplicating it, so "send again" is always the right advice —
    // without promising the message survived a pre-persist failure.
    console.error(`[assistant] run ${id}: turn failed`, error);
    return Response.json(
      { error: "The assistant could not answer just now. Please send your question again." },
      { status: 502 },
    );
  }
}
