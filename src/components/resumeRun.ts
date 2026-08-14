const RUN_ID = /^[a-z0-9_-]{4,40}$/i;

export function resumedRunId(search: string): string | null {
  const runId = new URLSearchParams(search).get("run");
  return runId && RUN_ID.test(runId) ? runId : null;
}
