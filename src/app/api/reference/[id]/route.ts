import { z } from "zod";
import {
  ARTIFACTS,
  ReferenceSelectionStateSchema,
  ReferenceSelectionVersionSchema,
  type Intake,
} from "../../../../lib/contracts";
import path from "node:path";
import {
  RunNotFoundError,
  loadArtifact,
  loadRun,
  sitePaths,
  withRunTransaction,
} from "../../../../lib/runstate";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import { stageLockCandidates } from "../../../../lib/referenceStage";
import { withFileLock } from "../../../../lib/fileLock";
import {
  assertWebsiteProductionRun,
  websiteOnlyProductionResponse,
} from "../../../../lib/productionTarget";
import {
  recordReviewFeedback,
  ReviewFeedbackActionSchema,
  ReviewFeedbackError,
} from "../../../../lib/reviewFeedback";

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;

const ActionSchema = z.discriminatedUnion("action", [
  ReviewFeedbackActionSchema,
  z.object({
    action: z.literal("select"),
    selectedId: z.string().min(1).max(80),
    note: z.string().max(2_000).optional(),
  }),
  z.object({
    action: z.literal("reroll"),
    revisionNote: z.string().max(2_000).optional(),
  }),
]);

class ReferenceSelectionError extends Error {}

function pickerState(run: Awaited<ReturnType<typeof loadRun>>) {
  if (!run.referencePickerEnabled || !run.referenceSelection) {
    throw new ReferenceSelectionError("reference picker is not available for this run");
  }
  return run.referenceSelection;
}

function responsePayload(run: Awaited<ReturnType<typeof loadRun>>) {
  return { runId: run.id, referenceSelection: run.referenceSelection };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const run = await loadRun(id);
    pickerState(run);
    return Response.json(responsePayload(run));
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    if (error instanceof ReferenceSelectionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid reference action", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    await assertWebsiteProductionRun(id);
    const input = parsed.data;
    if (input.action === "record-feedback") {
      const state = pickerState(await loadRun(id));
      if (state.status !== "pending") {
        throw new ReferenceSelectionError("reference selection feedback is closed");
      }
      const version = state.versions.at(-1);
      if (!version) throw new ReferenceSelectionError("reference options are unavailable");
      const feedback = await recordReviewFeedback({
        runId: id,
        feedbackId: input.feedbackId,
        text: input.text,
        uploadSession: input.uploadSession,
        uploadIds: input.uploadIds,
        stage: "evidence",
        artifactType: "reference-selection",
        artifactVersion: version.version,
      });
      return Response.json({ ...responsePayload(await loadRun(id)), feedback });
    }
    if (input.action === "select") {
      const selection = await withRunTransaction(id, async (transaction) => {
        const state = pickerState(transaction.state);
        if (state.status === "selected") {
          if (state.selection?.selectedId === input.selectedId) return state;
          throw new ReferenceSelectionError("a reference candidate has already been selected");
        }
        // Every shown direction stays choosable — including ones from before
        // a reroll (soak feedback 2026-08-15: "you can't go back"). Candidate
        // ids are unique across versions by schema invariant.
        const version = state.versions.find((entry) =>
          entry.candidates.some((c) => c.referoId === input.selectedId)
        );
        const candidate = version?.candidates.find(
          (entry) => entry.referoId === input.selectedId
        );
        if (!version || !candidate) {
          throw new ReferenceSelectionError("selected candidate is not among the shown options");
        }
        const next = ReferenceSelectionStateSchema.parse({
          ...state,
          status: "selected",
          selection: {
            selectedId: candidate.referoId,
            selectionKind: candidate.recommended
              ? "user-picked-recommended"
              : "user-picked-other",
            version: version.version,
            at: new Date().toISOString(),
            note: input.note,
          },
        });
        transaction.state.referenceSelection = next;
        return next;
      });
      return Response.json({
        runId: id,
        referenceSelection: selection,
        resumeUrl: "/api/run",
        resumeMethod: "POST",
      });
    }

    // Cheap pre-checks so obvious rejections don't depend on intake loading;
    // the authoritative status/cap check re-runs inside the locked transaction.
    const beforeReservation = pickerState(await loadRun(id));
    if (beforeReservation.status !== "pending") {
      throw new ReferenceSelectionError("a reference candidate has already been selected");
    }
    if (beforeReservation.rerollsUsed >= 2) {
      throw new ReferenceSelectionError("no rerolls remaining");
    }
    const intake = await loadArtifact<Intake>(id, ARTIFACTS.intake);
    if (!intake) {
      throw new ReferenceSelectionError("reference picker intake is unavailable");
    }
    // The whole reroll (reserve → generate → append) is serialized per run:
    // without this, a double-submit burns two reservations racing for one
    // append slot and the loser gets a 409 with no refund (review finding,
    // 2026-08-15). Under the lock, a second submit waits and then sees the
    // updated counter/cap honestly.
    return await withFileLock(
      path.join(sitePaths(id).root, "reference-reroll.lock"),
      async () => {
        const reservation = await withRunTransaction(id, async (transaction) => {
          const state = pickerState(transaction.state);
          if (state.status !== "pending") {
            throw new ReferenceSelectionError("a reference candidate has already been selected");
          }
          if (state.rerollsUsed >= 2) {
            throw new ReferenceSelectionError("no rerolls remaining");
          }
          const rerollsUsed = state.rerollsUsed + 1;
          const excludedIds = state.versions.flatMap((version) =>
            version.candidates.map((candidate) => candidate.referoId)
          );
          transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
            ...state,
            rerollsUsed,
          });
          return { rerollsUsed, excludedIds, versionCount: state.versions.length };
        });

        const version = await stageLockCandidates(id, intake, () => undefined, {
          // Versions stay linear regardless of spent-but-failed reservations:
          // the next slot comes from the version count, never the reservation
          // counter (after a failed reroll they diverge).
          version: reservation.versionCount + 1,
          revisionNote: input.revisionNote,
          excludedIds: reservation.excludedIds,
        });
        if (!version) {
          // The reservation remains spent: refunding after a failed/freshness-short
          // generation would let retries bypass the server-side reroll cap.
          return Response.json({ ok: false, reason: "no-fresh-directions" });
        }

        const referenceSelection = await withRunTransaction(id, async (transaction) => {
          const state = pickerState(transaction.state);
          if (
            state.status !== "pending" ||
            state.rerollsUsed !== reservation.rerollsUsed ||
            state.versions.length !== reservation.versionCount
          ) {
            throw new ReferenceSelectionError("reference picker state changed during reroll");
          }
          const next = ReferenceSelectionStateSchema.parse({
            ...state,
            versions: [...state.versions, ReferenceSelectionVersionSchema.parse(version)],
          });
          transaction.state.referenceSelection = next;
          return next;
        });
        return Response.json({ ok: true, version, referenceSelection });
      }
    );
  } catch (error) {
    const targetResponse = websiteOnlyProductionResponse(error);
    if (targetResponse) return targetResponse;
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    if (error instanceof ReferenceSelectionError) {
      const status = error.message === "selected candidate is not among the shown options" ? 400 : 409;
      return Response.json({ error: error.message }, { status });
    }
    if (error instanceof ReviewFeedbackError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
