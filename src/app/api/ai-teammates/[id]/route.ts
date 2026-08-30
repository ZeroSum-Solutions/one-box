import { z } from "zod";

import {
  AiTeammateDataClassV1Schema,
  AiTeammateIdV1Schema,
  RunIdSchema,
} from "../../../../lib/contracts";
import {
  executeAiTeammateJobV1,
  hashAiTeammateInputV1,
} from "../../../../lib/aiTeammates/executor";
import {
  getAiTeammate,
  listAiTeammates,
} from "../../../../lib/aiTeammates/registry";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";

export const dynamic = "force-dynamic";

const LANE_LABEL = "Local foundation";
const PROPOSAL_SCHEMA_ID = "one-box.proposal.local-foundation.v1";
const PROPOSAL_ONLY_NOTICE =
  "Proposal only — no project or site changes were applied.";

const LocalAssignmentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    teammateId: AiTeammateIdV1Schema,
    task: z.string().trim().min(1).max(2_000),
    dataClass: AiTeammateDataClassV1Schema,
    effectClasses: z.tuple([z.literal("read"), z.literal("propose")]),
    toolGrants: z.array(z.never()).length(0),
    childToolGrants: z.array(z.never()).length(0),
  })
  .strict();

const LocalProposalV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    teammateId: AiTeammateIdV1Schema,
    task: z.string().min(1).max(2_000),
    recommendation: z.string().min(1).max(500),
    boundaries: z.tuple([
      z.literal("Read and propose only."),
      z.literal(
        "No tools, providers, networks, credentials, or project mutations were used.",
      ),
    ]),
    notice: z.literal(PROPOSAL_ONLY_NOTICE),
  })
  .strict();

function unauthorizedResponse(): Response {
  return Response.json(
    { error: "Unauthorized local API request" },
    { status: 403 },
  );
}

function invalidRunResponse(): Response {
  return Response.json({ error: "Invalid run id" }, { status: 400 });
}

function invalidAssignmentResponse(): Response {
  return Response.json(
    {
      error:
        "Assignment must name one teammate, one bounded task, public or project-internal data, explicit read/propose effects, and empty parent and child tool grants.",
    },
    { status: 400 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalApiAuthorized(request)) return unauthorizedResponse();

  const { id } = await context.params;
  const parsedRunId = RunIdSchema.safeParse(id);
  if (!parsedRunId.success) return invalidRunResponse();

  return Response.json(
    {
      schemaVersion: 1,
      lane: LANE_LABEL,
      runId: parsedRunId.data,
      teammates: listAiTeammates(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Keep the origin/token gate before params and, critically, before reading
  // an untrusted request body. This is the same local-only boundary used by
  // the incumbent Canvas APIs.
  if (!isLocalApiAuthorized(request)) return unauthorizedResponse();

  const { id } = await context.params;
  const parsedRunId = RunIdSchema.safeParse(id);
  if (!parsedRunId.success) return invalidRunResponse();

  const parsedAssignment = LocalAssignmentV1Schema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedAssignment.success) return invalidAssignmentResponse();

  const assignment = parsedAssignment.data;
  const teammate = getAiTeammate(assignment.teammateId);
  if (!teammate) return invalidAssignmentResponse();

  const input = {
    schemaVersion: 1 as const,
    dataClass: assignment.dataClass,
    payload: { task: assignment.task },
  };
  const inputSha256 = hashAiTeammateInputV1(input);
  const now = Date.now();
  const job = {
    schemaVersion: 1 as const,
    jobId: `job-${assignment.teammateId}-${inputSha256.slice(0, 16)}`,
    projectId: parsedRunId.data,
    taskId: `task-${inputSha256.slice(0, 20)}`,
    actorId: "local-owner",
    teammateId: assignment.teammateId,
    inputSha256,
    expectedProposalSchemaId: PROPOSAL_SCHEMA_ID,
    effectClasses: assignment.effectClasses,
    toolGrants: assignment.toolGrants,
    childToolGrants: assignment.childToolGrants,
    dataClasses: [assignment.dataClass],
    maxInputBytes: 8_192,
    maxProposalBytes: 8_192,
    maxDurationMs: 1_000,
    maxAttempts: 1 as const,
    maxDelegationDepth: 0 as const,
    deadlineAt: new Date(now + 10_000).toISOString(),
    cancellationPolicy: "caller-signal-only" as const,
    retentionPolicy: "process-only" as const,
    fallback: "none" as const,
    executionLane: "deterministic-local" as const,
  };

  const result = await executeAiTeammateJobV1({
    job,
    input,
    proposalSchemaId: PROPOSAL_SCHEMA_ID,
    proposalSchema: LocalProposalV1Schema,
    propose: ({ input: boundedInput }) => {
      const payload = boundedInput.payload as { readonly task: string };
      return {
        schemaVersion: 1 as const,
        teammateId: teammate.id,
        task: payload.task,
        recommendation: `Review this bounded task through ${teammate.specialty.toLowerCase()} and return a recommendation for human consideration.`,
        boundaries: [
          "Read and propose only." as const,
          "No tools, providers, networks, credentials, or project mutations were used." as const,
        ],
        notice: PROPOSAL_ONLY_NOTICE,
      };
    },
  });

  return Response.json(
    {
      schemaVersion: 1,
      lane: LANE_LABEL,
      runId: parsedRunId.data,
      proposal: result.proposal,
      receipt: result.receipt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
