import {
  inspectPromotedLiveBundle,
  type PromotedLiveBundleInspection,
} from "./candidate";
import {
  assertVisualQaApprovedForBuild,
  EvidenceWorkflowError,
  loadRun,
} from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";
import type { RunState } from "./contracts";

export type ReleaseAuthorization = {
  run: RunState;
  liveBundle: PromotedLiveBundleInspection;
};

/** Central release/export/client-handoff guard. The decision and downstream
 * read execute beneath one site-authority acquisition. */
export function withReleaseAuthorization<T>(
  runId: string,
  operation: (authorization: ReleaseAuthorization) => Promise<T>,
): Promise<T> {
  return withSiteAuthorityLock(runId, async () => {
    const run = await loadRun(runId);
    let liveBundle: PromotedLiveBundleInspection;
    try {
      liveBundle = await inspectPromotedLiveBundle(runId);
    } catch {
      throw new EvidenceWorkflowError(
        "promoted live bundle metadata is invalid; release, export, and client handoff are blocked",
      );
    }
    if (liveBundle.status === "present") {
      assertVisualQaApprovedForBuild(
        run,
        liveBundle.provenance.promotedBuildSha256!,
      );
    }
    return operation({ run, liveBundle });
  });
}
