import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listAiTeammates } from "../../../lib/aiTeammates/registry";
import {
  bindAiTeammateBusyState,
  canChangeAiTeammateAssignment,
  isCurrentAiTeammateRequest,
  isCurrentAiTeammateRosterRequest,
  loadAiTeammates,
  LocalAiTeammatePanel,
  LocalAiTeammatePanelContent,
  shouldCommitAiTeammateRequest,
  shouldCommitAiTeammateRosterRequest,
  submitAiTeammateAssignment,
} from "./LocalAiTeammatePanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectAssignmentControlsEnabled(html: string) {
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  expect(radios).toHaveLength(8);
  expect(radios.every((tag) => !tag.includes("disabled"))).toBe(true);
  expect(html.match(/<textarea[^>]*>/)?.[0]).not.toContain("disabled");
  expect(html.match(/<select[^>]*>/)?.[0]).not.toContain("disabled");
  expect(html.match(/<button type="submit"[^>]*>/)?.[0]).not.toContain(
    "disabled",
  );
}

describe("LocalAiTeammatePanel", () => {
  it("starts in the run-scoped loading state with submission disabled", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanel runId="run-demo" />,
    );

    expect(html).toContain("Loading the local roster…");
    expect(html).toContain("Local foundation");
    expect(html).toContain("Create placeholder proposal");
    expect(html).toContain("disabled");
  });

  it("does not submit while the run-scoped roster is still loading", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "loading" }}
        selectedTeammateId="researcher"
        task="This task is ready before the roster is."
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Loading the local roster…");
    expect(html).toContain(
      '<button type="submit" class="btn-primary" disabled="">Create placeholder proposal</button>',
    );
  });

  it("locks every assignment control and announces an in-flight proposal", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task="Keep this request bound."
        dataClass="project-internal"
        submission={{ kind: "working" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Creating a fixed deterministic placeholder…");
    expect(html).not.toContain("Working · Read + propose");
    expect(html.match(/Idle · Read \+ propose/g)).toHaveLength(8);
    expect(html).toContain(
      "Request progress is reported separately below.",
    );
    expect(html).toContain(
      "Idle means no process, provider, tools, lease, or budget is active.",
    );
    expect(html.match(/type="radio"[^>]*disabled/g)).toHaveLength(8);
    expect(html.match(/<textarea[^>]*>/)?.[0]).toContain("disabled");
    expect(html).toContain(
      'aria-describedby="ai-teammate-assignment-help ai-teammate-assignment-working"',
    );
    expect(html).toContain(
      'id="ai-teammate-data-class" aria-describedby="ai-teammate-data-class-help ai-teammate-assignment-working" disabled=""',
    );
    expect(html).toContain('id="ai-teammate-assignment-working"');
    const workingSubmit = html.match(/<button type="submit"[^>]*>/)?.[0];
    expect(workingSubmit).toBe(
      '<button type="submit" class="btn-primary" aria-disabled="true">',
    );
    expect(canChangeAiTeammateAssignment({ kind: "working" })).toBe(false);
  });

  it("locks Agent Studio synchronously before publishing the working state", () => {
    const events: string[] = [];
    const next = bindAiTeammateBusyState(
      (busy) => events.push(`busy:${busy}`),
      true,
      { kind: "working" },
    );
    events.push(`state:${next.kind}`);

    expect(events).toEqual(["busy:true", "state:working"]);
  });

  it("keeps idle nonempty assignment controls enabled", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task="Ready to propose."
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expectAssignmentControlsEnabled(html);
  });

  it("rejects stale submit and roster completions across generations, runs, and assignment bindings", () => {
    const request = {
      generation: 4,
      runId: "run-a",
      teammateId: "researcher" as const,
      task: "Bound task",
      dataClass: "project-internal" as const,
    };

    expect(isCurrentAiTeammateRequest(request, request)).toBe(true);
    expect(
      isCurrentAiTeammateRequest(request, { ...request, generation: 5 }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRequest(request, { ...request, runId: "run-b" }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRequest(request, {
        ...request,
        teammateId: "canvas-designer",
      }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRequest(request, { ...request, task: "Changed" }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRequest(request, {
        ...request,
        dataClass: "public",
      }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRosterRequest(
        { generation: 2, runId: "run-a" },
        { generation: 3, runId: "run-a" },
      ),
    ).toBe(false);
    expect(
      shouldCommitAiTeammateRequest({
        mounted: false,
        request,
        current: request,
      }),
    ).toBe(false);
    expect(
      shouldCommitAiTeammateRequest({
        mounted: true,
        request,
        current: { ...request, generation: 5 },
      }),
    ).toBe(false);
    expect(
      shouldCommitAiTeammateRosterRequest({
        mounted: true,
        request: { generation: 2, runId: "run-a" },
        current: { generation: 3, runId: "run-a" },
      }),
    ).toBe(false);
    expect(
      isCurrentAiTeammateRosterRequest(
        { generation: 3, runId: "run-a" },
        { generation: 3, runId: "run-b" },
      ),
    ).toBe(false);
  });

  it("shows the complete roster and an explicitly bounded keyboard-native assignment form", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task=""
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    for (const name of [
      "Researcher",
      "PRD Planner",
      "Architecture Analyst",
      "Canvas Designer",
      "Implementation Producer",
      "QA Challenger",
      "Security Challenger",
      "SEO Qualifier",
    ]) {
      expect(html).toContain(name);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(8);
    expect(html).toContain("Local foundation");
    expect(html).toContain("Idle means no process, provider, tools, lease, or budget is active.");
    expect(html).toContain("Read + propose only");
    expect(html).toContain("No mutation, external effect, or authority");
    expect(html).toContain('for="ai-teammate-task"');
    expect(html).toContain('id="ai-teammate-task"');
    expect(html).toContain('aria-describedby="ai-teammate-assignment-help"');
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('for="ai-teammate-data-class"');
    expect(html).toContain("Project internal");
    expect(html).toContain("Public");
    expect(html).toContain("Create placeholder proposal");
    expect(html).toContain("disabled");
    expect(html).toContain("Proposal only — nothing is applied automatically.");
    expect(html).not.toContain("Apply proposal");
  });

  it("states that no model or provider is connected and labels the deterministic action as a placeholder", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task="Draft a bounded placeholder."
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("No AI model or provider is connected");
    expect(html).toContain("fixed deterministic placeholder");
    expect(html).toContain("Create placeholder proposal");
    expect(html.match(/Idle · Read \+ propose/g)).toHaveLength(8);
  });

  it("describes data class as a caller label and warns against sensitive assignment content", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task="Review public evidence only."
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('id="ai-teammate-data-class-help"');
    expect(html).toContain(
      'id="ai-teammate-data-class" aria-describedby="ai-teammate-data-class-help"',
    );
    expect(html).toContain("nothing is scanned or read from the project");
    for (const warning of [
      "credentials",
      "cookies",
      "client-sensitive",
      "release",
      "appointment details",
    ]) {
      expect(html).toContain(warning);
    }
  });

  it("announces a terminal proposal receipt with every audit field in text", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="qa-challenger"
        task="Challenge the acceptance criteria."
        dataClass="project-internal"
        submission={{
          kind: "result",
          proposal: {
            schemaVersion: 1,
            teammateId: "qa-challenger",
            task: "Challenge the acceptance criteria.",
            recommendation: "Check each criterion against an observable outcome.",
            boundaries: [
              "Read and propose only.",
              "No tools, providers, networks, credentials, or project mutations were used.",
            ],
            notice: "Proposal only — no project or site changes were applied.",
          },
          receipt: {
            schemaVersion: 1,
            jobId: "job-qa-challenger-1234",
            jobSha256: "a".repeat(64),
            teammateId: "qa-challenger",
            inputSha256: "b".repeat(64),
            outputSha256: "c".repeat(64),
            partialOutputSha256: null,
            startedAt: "2026-08-30T07:00:00.000Z",
            stoppedAt: "2026-08-30T07:00:00.010Z",
            status: "complete",
            stoppingCondition: "proposal-complete",
            retryEligible: false,
            effectClasses: ["read", "propose"],
            outputSchemaId: "one-box.proposal.local-foundation.v1",
            providerCostUsd: 0,
            executionLane: "deterministic-local",
          },
        }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const resultHtml = html.slice(html.indexOf('class="ai-teammate-result"'));
    const receiptHtml = html.slice(html.indexOf('class="ai-teammate-receipt"'));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(resultHtml).toContain('aria-atomic="true"');
    expect(resultHtml).toContain("Placeholder proposal");
    expect(html).toContain("No AI model or provider is connected");
    expect(resultHtml).toContain("Role template:");
    expect(resultHtml).toContain("Assigned task:");
    expect(resultHtml).toContain(
      "Check each criterion against an observable outcome.",
    );
    expect(resultHtml).toContain(
      "Proposal only — no project or site changes were applied.",
    );
    expect(resultHtml).toContain("Run receipt");
    for (const text of [
      "Check each criterion against an observable outcome.",
      "Role template:",
      "Assigned task:",
      "Challenge the acceptance criteria.",
      "complete",
      "proposal-complete",
      "QA Challenger",
      "job-qa-challenger-1234",
      "Job hash",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Input hash",
      "Output hash",
      "Partial output hash",
      "Started",
      "2026-08-30T07:00:00.000Z",
      "Stopped",
      "2026-08-30T07:00:00.010Z",
      "Output schema",
      "one-box.proposal.local-foundation.v1",
      "No",
      "Read, propose",
      "deterministic-local",
      "Proposal only — nothing is applied automatically.",
    ]) {
      expect(html).toContain(text);
    }
    expect(receiptHtml).toContain(
      "Proposal only — no project or site changes were applied.",
    );
    expect(receiptHtml).toContain("External cost");
    expect(receiptHtml).toContain("None");
    expect(receiptHtml).not.toContain("Provider cost");
    expect(receiptHtml).not.toContain("$0");
    expect(html).not.toContain("Apply proposal");
    expectAssignmentControlsEnabled(html);
  });

  it("loads the run-scoped local roster without caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
          schemaVersion: 1,
          lane: "Local foundation",
          runId: "run-demo",
          teammates: listAiTeammates(),
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAiTeammates("run-demo");

    expect(result).toEqual({ kind: "ready", teammates: listAiTeammates() });
    expect(fetchMock).toHaveBeenCalledWith("/api/ai-teammates/run-demo", {
      cache: "no-store",
    });
  });

  it("rejects a roster response that is not bound to this run and lane", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        lane: "Provider-backed",
        runId: "run-other",
        teammates: listAiTeammates(),
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAiTeammates("run-demo")).resolves.toEqual({
      kind: "error",
      message: "We could not load the local roster. Try again.",
    });
  });

  it("rejects an empty assignment locally as a task error without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitAiTeammateAssignment(
        "run-demo",
        "researcher",
        "   ",
        "project-internal",
      ),
    ).resolves.toEqual({
      kind: "error",
      origin: "task",
      message: "Write an assignment between 1 and 2,000 characters.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits only the explicit local read/propose envelope", async () => {
    const proposal = {
      schemaVersion: 1 as const,
      teammateId: "researcher" as const,
      task: "Find the strongest evidence.",
      recommendation: "Review evidence and return a bounded recommendation.",
      boundaries: [
        "Read and propose only.",
        "No tools, providers, networks, credentials, or project mutations were used.",
      ] as const,
      notice: "Proposal only — no project or site changes were applied.",
    };
    const receipt = {
      schemaVersion: 1 as const,
      jobId: "job-researcher-1234",
      jobSha256: "a".repeat(64),
      teammateId: "researcher" as const,
      inputSha256: "b".repeat(64),
      outputSha256: "c".repeat(64),
      partialOutputSha256: null,
      startedAt: "2026-08-30T07:00:00.000Z",
      stoppedAt: "2026-08-30T07:00:00.010Z",
      status: "complete" as const,
      stoppingCondition: "proposal-complete" as const,
      retryEligible: false,
      effectClasses: ["read", "propose"] as const,
      outputSchemaId: "one-box.proposal.local-foundation.v1",
      providerCostUsd: 0 as const,
      executionLane: "deterministic-local" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-demo",
        proposal,
        receipt,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitAiTeammateAssignment(
      "run-demo",
      "researcher",
      "  Find the strongest evidence.  ",
      "project-internal",
    );

    expect(result).toEqual({ kind: "result", proposal, receipt });
    expect(fetchMock).toHaveBeenCalledWith("/api/ai-teammates/run-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        teammateId: "researcher",
        task: "Find the strongest evidence.",
        dataClass: "project-internal",
        effectClasses: ["read", "propose"],
        toolGrants: [],
        childToolGrants: [],
      }),
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/edit",
      expect.anything(),
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-other",
        proposal,
        receipt,
      }),
    } satisfies Partial<Response>);
    await expect(
      submitAiTeammateAssignment(
        "run-demo",
        "researcher",
        "Find the strongest evidence.",
        "project-internal",
      ),
    ).resolves.toEqual({
      kind: "error",
      origin: "request",
      message:
        "The local teammate returned an invalid receipt. Nothing was applied; try again.",
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-demo",
        proposal: { ...proposal, teammateId: "canvas-designer" },
        receipt,
      }),
    } satisfies Partial<Response>);
    await expect(
      submitAiTeammateAssignment(
        "run-demo",
        "researcher",
        "Find the strongest evidence.",
        "project-internal",
      ),
    ).resolves.toMatchObject({ kind: "error", origin: "request" });

    const residualMismatches = [
      {
        proposal: { ...proposal, notice: "Looks ready to apply." },
        receipt,
      },
      {
        proposal,
        receipt: { ...receipt, executionLane: "provider-backed" },
      },
      {
        proposal,
        receipt: { ...receipt, providerCostUsd: 1 },
      },
      {
        proposal,
        receipt: { ...receipt, effectClasses: ["read"] },
      },
      {
        proposal,
        receipt: { ...receipt, outputSchemaId: "unbound.proposal.v1" },
      },
      {
        proposal,
        receipt: { ...receipt, jobSha256: "A".repeat(64) },
      },
      {
        proposal,
        receipt: { ...receipt, inputSha256: "short" },
      },
      {
        proposal,
        receipt: { ...receipt, outputSha256: null },
      },
      {
        proposal,
        receipt: { ...receipt, partialOutputSha256: "d".repeat(64) },
      },
      {
        proposal,
        receipt: { ...receipt, retryEligible: true },
      },
      {
        proposal: { ...proposal, task: "Changed task" },
        receipt,
      },
    ];
    for (const mismatch of residualMismatches) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lane: "Local foundation",
          runId: "run-demo",
          ...mismatch,
        }),
      } satisfies Partial<Response>);
      await expect(
        submitAiTeammateAssignment(
          "run-demo",
          "researcher",
          "Find the strongest evidence.",
          "project-internal",
        ),
      ).resolves.toMatchObject({ kind: "error", origin: "request" });
    }
  });

  it("preserves a valid non-complete terminal receipt instead of calling it invalid", async () => {
    const receipt = {
      schemaVersion: 1 as const,
      jobId: "job-researcher-budget",
      jobSha256: "a".repeat(64),
      teammateId: "researcher" as const,
      inputSha256: "b".repeat(64),
      outputSha256: null,
      partialOutputSha256: null,
      startedAt: "2026-08-30T07:00:00.000Z",
      stoppedAt: "2026-08-30T07:00:00.010Z",
      status: "budget-exhausted" as const,
      stoppingCondition: "input-bytes-exceeded" as const,
      retryEligible: false,
      effectClasses: ["read", "propose"] as const,
      outputSchemaId: "one-box.proposal.local-foundation.v1",
      providerCostUsd: 0 as const,
      executionLane: "deterministic-local" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lane: "Local foundation",
          runId: "run-demo",
          proposal: null,
          receipt,
        }),
      } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitAiTeammateAssignment(
        "run-demo",
        "researcher",
        "Bounded input that exceeded the byte budget.",
        "project-internal",
      ),
    ).resolves.toEqual({ kind: "terminal", receipt });

    const invalidTerminalEnvelopes = [
      {
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-demo",
        proposal: { schemaVersion: 1 },
        receipt,
      },
      {
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-demo",
        receipt,
      },
      {
        schemaVersion: 1,
        lane: "Local foundation",
        runId: "run-demo",
        proposal: null,
        receipt,
        output: { hidden: "not part of the local envelope" },
      },
    ];
    for (const envelope of invalidTerminalEnvelopes) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => envelope,
      } satisfies Partial<Response>);
      await expect(
        submitAiTeammateAssignment(
          "run-demo",
          "researcher",
          "Bounded input that exceeded the byte budget.",
          "project-internal",
        ),
      ).resolves.toMatchObject({ kind: "error", origin: "request" });
    }
  });

  it("renders a valid non-complete receipt without marking the assignment invalid", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task="Bounded input that exceeded the byte budget."
        dataClass="project-internal"
        submission={{
          kind: "terminal",
          receipt: {
            schemaVersion: 1,
            jobId: "job-researcher-budget",
            jobSha256: "a".repeat(64),
            teammateId: "researcher",
            inputSha256: "b".repeat(64),
            outputSha256: null,
            partialOutputSha256: null,
            startedAt: "2026-08-30T07:00:00.000Z",
            stoppedAt: "2026-08-30T07:00:00.010Z",
            status: "budget-exhausted",
            stoppingCondition: "input-bytes-exceeded",
            retryEligible: false,
            effectClasses: ["read", "propose"],
            outputSchemaId: "one-box.proposal.local-foundation.v1",
            providerCostUsd: 0,
            executionLane: "deterministic-local",
          },
        }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Run ended without a placeholder proposal");
    expect(html).toContain("budget-exhausted");
    expect(html).toContain("input-bytes-exceeded");
    expect(html).toContain("Retry eligible");
    expect(html).toContain("<dt>Retry eligible</dt><dd>No</dd>");
    expect(html).not.toContain("invalid receipt");
    expect(html.match(/<textarea[^>]*>/)?.[0]).not.toContain("aria-invalid");
    expectAssignmentControlsEnabled(html);
  });

  it("keeps a failed assignment editable and explains how to recover", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="canvas-designer"
        task="Review the compact canvas controls."
        dataClass="project-internal"
        submission={{
          kind: "error",
          origin: "request",
          message: "The local teammate returned an invalid receipt.",
        }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("The local teammate returned an invalid receipt.");
    expect(html.match(/<textarea[^>]*>/)?.[0]).not.toContain("aria-invalid");
    expect(html).toContain(
      'aria-describedby="ai-teammate-assignment-help ai-teammate-assignment-error"',
    );
    expect(html).toContain('id="ai-teammate-assignment-error"');
    expect(html).toContain(
      "Your assignment is still here. Review it and try again.",
    );
    expect(html).toContain("Review the compact canvas controls.");
    expect(html).toContain('<button type="submit" class="btn-primary">');
    expectAssignmentControlsEnabled(html);
  });

  it("marks only a local task-field validation error as aria-invalid", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{ kind: "ready", teammates: listAiTeammates() }}
        selectedTeammateId="researcher"
        task=" "
        dataClass="project-internal"
        submission={{
          kind: "error",
          origin: "task",
          message: "Write an assignment between 1 and 2,000 characters.",
        }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html.match(/<textarea[^>]*>/)?.[0]).toContain(
      'aria-invalid="true"',
    );
    expect(html).toContain('id="ai-teammate-assignment-error"');
    expect(html).toContain(
      'aria-describedby="ai-teammate-assignment-help ai-teammate-assignment-error"',
    );
  });

  it("keeps the retry control focusable and announces progress outside the error alert", () => {
    const html = renderToStaticMarkup(
      <LocalAiTeammatePanelContent
        rosterState={{
          kind: "error",
          message: "Temporary local roster failure.",
          retrying: true,
        }}
        selectedTeammateId="researcher"
        task=""
        dataClass="project-internal"
        submission={{ kind: "idle" }}
        onRetryRoster={() => undefined}
        onSelectTeammate={() => undefined}
        onTaskChange={() => undefined}
        onDataClassChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const retryButton = html.match(/<button[^>]*>Try again<\/button>/)?.[0];
    expect(retryButton).toContain('aria-disabled="true"');
    expect(retryButton).not.toContain(' disabled');
    expect(html).toContain(
      '</div><p role="status">Trying the local roster again…</p>',
    );
  });
});
