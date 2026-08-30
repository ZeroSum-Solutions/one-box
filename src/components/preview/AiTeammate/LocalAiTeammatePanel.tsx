"use client";

import { useEffect, useRef, useState } from "react";
import {
  AiTeammateRegistryV1Schema,
  AiTeammateRunReceiptV1Schema,
} from "../../../lib/contracts";
import type {
  AiTeammateDataClassV1,
  AiTeammateDefinitionV1,
  AiTeammateIdV1,
  AiTeammateRunReceiptV1,
} from "../../../lib/contracts";

const LOCAL_PROPOSAL_SCHEMA_ID = "one-box.proposal.local-foundation.v1";
const LOCAL_PROPOSAL_NOTICE =
  "Proposal only — no project or site changes were applied.";
const LOCAL_PROPOSAL_BOUNDARIES = [
  "Read and propose only.",
  "No tools, providers, networks, credentials, or project mutations were used.",
] as const;
const LOWER_SHA256 = /^[a-f0-9]{64}$/;

export type AiTeammateRosterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; teammates: readonly AiTeammateDefinitionV1[] };

export type AiTeammateSubmissionState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | {
      kind: "result";
      proposal: LocalAiTeammateProposal;
      receipt: AiTeammateRunReceiptV1;
    };

export type LocalAiTeammateProposal = {
  readonly schemaVersion: 1;
  readonly teammateId: AiTeammateIdV1;
  readonly task: string;
  readonly recommendation: string;
  readonly boundaries: readonly [string, string];
  readonly notice: string;
};

export type AiTeammateRequestBinding = {
  readonly generation: number;
  readonly runId: string;
  readonly teammateId: AiTeammateIdV1;
  readonly task: string;
  readonly dataClass: AiTeammateDataClassV1;
};

export type AiTeammateRosterRequestBinding = {
  readonly generation: number;
  readonly runId: string;
};

export function isCurrentAiTeammateRequest(
  request: AiTeammateRequestBinding,
  current: AiTeammateRequestBinding,
): boolean {
  return (
    request.generation === current.generation &&
    request.runId === current.runId &&
    request.teammateId === current.teammateId &&
    request.task === current.task &&
    request.dataClass === current.dataClass
  );
}

export function isCurrentAiTeammateRosterRequest(
  request: AiTeammateRosterRequestBinding,
  current: AiTeammateRosterRequestBinding,
): boolean {
  return (
    request.generation === current.generation &&
    request.runId === current.runId
  );
}

export function shouldCommitAiTeammateRequest({
  mounted,
  request,
  current,
}: {
  readonly mounted: boolean;
  readonly request: AiTeammateRequestBinding;
  readonly current: AiTeammateRequestBinding;
}): boolean {
  return mounted && isCurrentAiTeammateRequest(request, current);
}

export function shouldCommitAiTeammateRosterRequest({
  mounted,
  request,
  current,
}: {
  readonly mounted: boolean;
  readonly request: AiTeammateRosterRequestBinding;
  readonly current: AiTeammateRosterRequestBinding;
}): boolean {
  return mounted && isCurrentAiTeammateRosterRequest(request, current);
}

export function canChangeAiTeammateAssignment(
  submission: AiTeammateSubmissionState,
): boolean {
  return submission.kind !== "working";
}

export function bindAiTeammateBusyState(
  onBusyChange: ((busy: boolean) => void) | undefined,
  busy: boolean,
  next: AiTeammateSubmissionState,
): AiTeammateSubmissionState {
  onBusyChange?.(busy);
  return next;
}

function errorFrom(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function isLocalEnvelope(data: unknown, runId: string): data is {
  readonly schemaVersion: 1;
  readonly lane: "Local foundation";
  readonly runId: string;
} & Record<string, unknown> {
  return Boolean(
    data &&
      typeof data === "object" &&
      "schemaVersion" in data &&
      data.schemaVersion === 1 &&
      "lane" in data &&
      data.lane === "Local foundation" &&
      "runId" in data &&
      data.runId === runId,
  );
}

export async function loadAiTeammates(
  runId: string,
): Promise<AiTeammateRosterState> {
  try {
    const response = await fetch(
      `/api/ai-teammates/${encodeURIComponent(runId)}`,
      { cache: "no-store" },
    );
    const data = await responseJson(response);
    if (!response.ok) {
      return {
        kind: "error",
        message: errorFrom(data, "We could not load the local roster. Try again."),
      };
    }
    const parsed = AiTeammateRegistryV1Schema.safeParse(
      isLocalEnvelope(data, runId) && "teammates" in data
        ? data.teammates
        : null,
    );
    return parsed.success
      ? { kind: "ready", teammates: parsed.data }
      : {
          kind: "error",
          message: "We could not load the local roster. Try again.",
        };
  } catch {
    return {
      kind: "error",
      message: "We could not load the local roster. Try again.",
    };
  }
}

function proposalFrom(data: unknown): LocalAiTeammateProposal | null {
  if (!data || typeof data !== "object") return null;
  if (
    !("schemaVersion" in data) ||
    data.schemaVersion !== 1 ||
    !("teammateId" in data) ||
    typeof data.teammateId !== "string" ||
    !("task" in data) ||
    typeof data.task !== "string" ||
    !("recommendation" in data) ||
    typeof data.recommendation !== "string" ||
    !("boundaries" in data) ||
    !Array.isArray(data.boundaries) ||
    data.boundaries.length !== 2 ||
    data.boundaries[0] !== LOCAL_PROPOSAL_BOUNDARIES[0] ||
    data.boundaries[1] !== LOCAL_PROPOSAL_BOUNDARIES[1] ||
    !("notice" in data) ||
    data.notice !== LOCAL_PROPOSAL_NOTICE
  ) {
    return null;
  }
  return data as LocalAiTeammateProposal;
}

export async function submitAiTeammateAssignment(
  runId: string,
  teammateId: AiTeammateIdV1,
  task: string,
  dataClass: AiTeammateDataClassV1,
): Promise<AiTeammateSubmissionState> {
  const trimmed = task.trim();
  if (trimmed.length < 1 || trimmed.length > 2_000) {
    return {
      kind: "error",
      message: "Write an assignment between 1 and 2,000 characters.",
    };
  }
  try {
    const response = await fetch(
      `/api/ai-teammates/${encodeURIComponent(runId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          teammateId,
          task: trimmed,
          dataClass,
          effectClasses: ["read", "propose"],
          toolGrants: [],
          childToolGrants: [],
        }),
      },
    );
    const data = await responseJson(response);
    if (!response.ok) {
      return {
        kind: "error",
        message: errorFrom(
          data,
          "We could not create this proposal. Review the assignment and try again.",
        ),
      };
    }
    const proposal =
      isLocalEnvelope(data, runId) && "proposal" in data
        ? proposalFrom(data.proposal)
        : null;
    const receipt = AiTeammateRunReceiptV1Schema.safeParse(
      isLocalEnvelope(data, runId) && "receipt" in data
        ? data.receipt
        : null,
    );
    const isBoundResult =
      proposal &&
      receipt.success &&
      proposal.teammateId === teammateId &&
      receipt.data.teammateId === teammateId &&
      proposal.task === trimmed &&
      receipt.data.status === "complete" &&
      receipt.data.stoppingCondition === "proposal-complete" &&
      receipt.data.executionLane === "deterministic-local" &&
      receipt.data.providerCostUsd === 0 &&
      receipt.data.effectClasses.length === 2 &&
      receipt.data.effectClasses[0] === "read" &&
      receipt.data.effectClasses[1] === "propose" &&
      receipt.data.outputSchemaId === LOCAL_PROPOSAL_SCHEMA_ID &&
      LOWER_SHA256.test(receipt.data.jobSha256) &&
      LOWER_SHA256.test(receipt.data.inputSha256) &&
      receipt.data.outputSha256 !== null &&
      LOWER_SHA256.test(receipt.data.outputSha256) &&
      receipt.data.partialOutputSha256 === null &&
      receipt.data.retryEligible === false;
    return isBoundResult
      ? { kind: "result", proposal, receipt: receipt.data }
      : {
          kind: "error",
          message:
            "The local teammate returned an invalid receipt. Nothing was applied; try again.",
        };
  } catch {
    return {
      kind: "error",
      message:
        "We could not create this proposal. Nothing was applied; try again.",
    };
  }
}

export function LocalAiTeammatePanel({
  runId,
  onBusyChange,
}: {
  runId: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  // A run change is a hard session boundary: remounting drops every old
  // draft/result and lets the inner cleanup invalidate in-flight requests.
  return (
    <LocalAiTeammateRunPanel
      key={runId}
      runId={runId}
      onBusyChange={onBusyChange}
    />
  );
}

function LocalAiTeammateRunPanel({
  runId,
  onBusyChange,
}: {
  runId: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [rosterState, setRosterState] = useState<AiTeammateRosterState>({
    kind: "loading",
  });
  const [selectedTeammateId, setSelectedTeammateId] =
    useState<AiTeammateIdV1>("researcher");
  const [task, setTask] = useState("");
  const [dataClass, setDataClass] =
    useState<AiTeammateDataClassV1>("project-internal");
  const [submission, setSubmission] =
    useState<AiTeammateSubmissionState>({ kind: "idle" });
  const submitting = useRef(false);
  const mounted = useRef(true);
  const rosterGeneration = useRef(0);
  const submissionGeneration = useRef(0);
  const selectedTeammateRef = useRef<AiTeammateIdV1>("researcher");
  const taskRef = useRef("");
  const dataClassRef = useRef<AiTeammateDataClassV1>("project-internal");

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    mounted.current = true;
    const request = {
      generation: ++rosterGeneration.current,
      runId,
    };
    void loadAiTeammates(runId).then((next) => {
      const current = { generation: rosterGeneration.current, runId };
      if (shouldCommitAiTeammateRosterRequest({
        mounted: mounted.current,
        request,
        current,
      })) {
        setRosterState(next);
      }
    });
    return () => {
      mounted.current = false;
      rosterGeneration.current += 1;
      submissionGeneration.current += 1;
      submitting.current = false;
    };
  }, [runId]);

  async function reloadRoster() {
    const request = {
      generation: ++rosterGeneration.current,
      runId,
    };
    setRosterState({ kind: "loading" });
    const next = await loadAiTeammates(runId);
    const current = { generation: rosterGeneration.current, runId };
    if (shouldCommitAiTeammateRosterRequest({
      mounted: mounted.current,
      request,
      current,
    })) {
      setRosterState(next);
    }
  }

  async function createProposal() {
    if (submitting.current || !task.trim()) return;
    submitting.current = true;
    const request: AiTeammateRequestBinding = {
      generation: ++submissionGeneration.current,
      runId,
      teammateId: selectedTeammateId,
      task,
      dataClass,
    };
    setSubmission(
      bindAiTeammateBusyState(onBusyChange, true, { kind: "working" }),
    );
    try {
      const next = await submitAiTeammateAssignment(
        request.runId,
        request.teammateId,
        request.task,
        request.dataClass,
      );
      const current: AiTeammateRequestBinding = {
        generation: submissionGeneration.current,
        runId,
        teammateId: selectedTeammateRef.current,
        task: taskRef.current,
        dataClass: dataClassRef.current,
      };
      if (shouldCommitAiTeammateRequest({
        mounted: mounted.current,
        request,
        current,
      })) {
        setSubmission(bindAiTeammateBusyState(onBusyChange, false, next));
      }
    } finally {
      if (request.generation === submissionGeneration.current) {
        submitting.current = false;
      }
    }
  }

  return (
    <LocalAiTeammatePanelContent
      rosterState={rosterState}
      selectedTeammateId={selectedTeammateId}
      task={task}
      dataClass={dataClass}
      submission={submission}
      onRetryRoster={() => void reloadRoster()}
      onSelectTeammate={(teammateId) => {
        if (submitting.current || !canChangeAiTeammateAssignment(submission)) {
          return;
        }
        submissionGeneration.current += 1;
        selectedTeammateRef.current = teammateId;
        setSelectedTeammateId(teammateId);
        setSubmission({ kind: "idle" });
      }}
      onTaskChange={(nextTask) => {
        if (submitting.current || !canChangeAiTeammateAssignment(submission)) {
          return;
        }
        submissionGeneration.current += 1;
        taskRef.current = nextTask;
        setTask(nextTask);
        if (submission.kind !== "idle") setSubmission({ kind: "idle" });
      }}
      onDataClassChange={(nextDataClass) => {
        if (submitting.current || !canChangeAiTeammateAssignment(submission)) {
          return;
        }
        submissionGeneration.current += 1;
        dataClassRef.current = nextDataClass;
        setDataClass(nextDataClass);
        setSubmission({ kind: "idle" });
      }}
      onSubmit={() => void createProposal()}
    />
  );
}

export function LocalAiTeammatePanelContent({
  rosterState,
  selectedTeammateId,
  task,
  dataClass,
  submission,
  onRetryRoster,
  onSelectTeammate,
  onTaskChange,
  onDataClassChange,
  onSubmit,
}: {
  rosterState: AiTeammateRosterState;
  selectedTeammateId: AiTeammateIdV1;
  task: string;
  dataClass: AiTeammateDataClassV1;
  submission: AiTeammateSubmissionState;
  onRetryRoster: () => void;
  onSelectTeammate: (teammateId: AiTeammateIdV1) => void;
  onTaskChange: (task: string) => void;
  onDataClassChange: (dataClass: AiTeammateDataClassV1) => void;
  onSubmit: () => void;
}) {
  const isWorking = submission.kind === "working";
  const hasError = submission.kind === "error";
  const taskDescriptionIds = [
    "ai-teammate-assignment-help",
    ...(hasError ? ["ai-teammate-assignment-error"] : []),
    ...(isWorking ? ["ai-teammate-assignment-working"] : []),
  ].join(" ");
  const canSubmit =
    rosterState.kind === "ready" && task.trim().length > 0 && !isWorking;

  return (
    <section className="ai-teammate-panel" aria-labelledby="ai-teammate-heading">
      <header className="ai-teammate-panel__intro">
        <div>
          <p className="eyebrow">{"{ Agent Studio }"}</p>
          <h2 id="ai-teammate-heading">Teammates</h2>
        </div>
        <span className="badge">Local foundation</span>
      </header>

      <p className="ai-teammate-panel__notice">
        Proposal only — nothing is applied automatically.
      </p>

      {rosterState.kind === "loading" && (
        <p role="status">Loading the local roster…</p>
      )}
      {rosterState.kind === "error" && (
        <div role="alert">
          <p>{rosterState.message}</p>
          <button type="button" className="btn-ghost" onClick={onRetryRoster}>
            Try again
          </button>
        </div>
      )}
      {rosterState.kind === "ready" && (
        <fieldset className="ai-teammate-roster">
          <legend>Choose a teammate</legend>
          <p>
            {isWorking
              ? "Working means one bound local proposal is being created. The other teammates remain idle."
              : "Idle means no process, provider, tools, lease, or budget is active."}
          </p>
          <div className="ai-teammate-roster__grid">
            {rosterState.teammates.map((teammate) => (
              <label className="ai-teammate-role" key={teammate.id}>
                <input
                  type="radio"
                  name="ai-teammate"
                  value={teammate.id}
                  checked={selectedTeammateId === teammate.id}
                  disabled={isWorking}
                  onChange={() => onSelectTeammate(teammate.id)}
                />
                <span>
                  <strong>{teammate.displayName}</strong>
                  <small>{teammate.specialty}</small>
                  <small>
                    {isWorking && selectedTeammateId === teammate.id
                      ? "Working"
                      : `${teammate.availability[0].toUpperCase()}${teammate.availability.slice(1)}`}
                    {" · "}
                    {teammate.effectClasses
                      .join(" + ")
                      .replace(/^./, (letter) => letter.toUpperCase())}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="ai-teammate-permissions">
        <strong>Read + propose only</strong>
        <span>No mutation, external effect, or authority</span>
      </div>

      <form
        className="ai-teammate-assignment"
        aria-busy={isWorking}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <label htmlFor="ai-teammate-task">Assignment</label>
        <p id="ai-teammate-assignment-help">
          Describe one bounded question or proposal for the selected teammate.
        </p>
        <textarea
          id="ai-teammate-task"
          aria-describedby={taskDescriptionIds}
          aria-invalid={hasError || undefined}
          maxLength={2_000}
          disabled={isWorking}
          value={task}
          onChange={(event) => onTaskChange(event.currentTarget.value)}
        />

        <label htmlFor="ai-teammate-data-class">Data class</label>
        <select
          id="ai-teammate-data-class"
          aria-describedby={
            isWorking ? "ai-teammate-assignment-working" : undefined
          }
          disabled={isWorking}
          value={dataClass}
          onChange={(event) =>
            onDataClassChange(event.currentTarget.value as AiTeammateDataClassV1)
          }
        >
          <option value="project-internal">Project internal</option>
          <option value="public">Public</option>
        </select>

        {submission.kind === "error" && (
          <div
            id="ai-teammate-assignment-error"
            className="ai-teammate-assignment__error"
            role="alert"
          >
            <p>{submission.message}</p>
            <p>Your assignment is still here. Review it and try again.</p>
          </div>
        )}
        {isWorking && (
          <p
            id="ai-teammate-assignment-working"
            role="status"
            aria-live="polite"
          >
            Creating a bound local proposal…
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {isWorking ? "Creating…" : "Create proposal"}
        </button>
      </form>

      {submission.kind === "result" && (
        <section
          className="ai-teammate-result"
          aria-labelledby="ai-teammate-result-heading"
          role={submission.receipt.status === "complete" ? "status" : "alert"}
          aria-live="polite"
          aria-atomic="true"
        >
          <h3 id="ai-teammate-result-heading">Proposal</h3>
          <p>
            <strong>Proposed by:</strong>{" "}
            {rosterState.kind === "ready"
              ? (rosterState.teammates.find(
                  ({ id }) => id === submission.proposal.teammateId,
                )?.displayName ?? submission.proposal.teammateId)
              : submission.proposal.teammateId}
          </p>
          <p>
            <strong>Assigned task:</strong> {submission.proposal.task}
          </p>
          <p>{submission.proposal.recommendation}</p>

          <div
            className="ai-teammate-receipt"
          >
            <h3>Run receipt</h3>
            <p>{submission.proposal.notice}</p>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{submission.receipt.status}</dd>
              </div>
              <div>
                <dt>Stopping condition</dt>
                <dd>{submission.receipt.stoppingCondition}</dd>
              </div>
              <div>
                <dt>Teammate</dt>
                <dd>
                  {rosterState.kind === "ready"
                    ? (rosterState.teammates.find(
                        ({ id }) => id === submission.receipt.teammateId,
                      )?.displayName ?? submission.receipt.teammateId)
                    : submission.receipt.teammateId}
                </dd>
              </div>
              <div>
                <dt>Job ID</dt>
                <dd>{submission.receipt.jobId}</dd>
              </div>
              <div>
                <dt>Job hash</dt>
                <dd>{submission.receipt.jobSha256}</dd>
              </div>
              <div>
                <dt>Input hash</dt>
                <dd>{submission.receipt.inputSha256}</dd>
              </div>
              <div>
                <dt>Output hash</dt>
                <dd>{submission.receipt.outputSha256 ?? "None"}</dd>
              </div>
              <div>
                <dt>Partial output hash</dt>
                <dd>{submission.receipt.partialOutputSha256 ?? "None"}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{submission.receipt.startedAt}</dd>
              </div>
              <div>
                <dt>Stopped</dt>
                <dd>{submission.receipt.stoppedAt}</dd>
              </div>
              <div>
                <dt>Retry eligible</dt>
                <dd>{submission.receipt.retryEligible ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Effects</dt>
                <dd>
                  {submission.receipt.effectClasses
                    .join(", ")
                    .replace(/^./, (letter) => letter.toUpperCase())}
                </dd>
              </div>
              <div>
                <dt>Lane</dt>
                <dd>{submission.receipt.executionLane}</dd>
              </div>
              <div>
                <dt>Output schema</dt>
                <dd>{submission.receipt.outputSchemaId}</dd>
              </div>
              <div>
                <dt>External cost</dt>
                <dd>None</dd>
              </div>
            </dl>
          </div>
        </section>
      )}
    </section>
  );
}
