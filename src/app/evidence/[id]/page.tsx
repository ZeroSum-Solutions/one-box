import { notFound } from "next/navigation";
import { EvidenceWorkspace } from "../../../components/EvidenceWorkspace";
import { toPageIrSourceReviewView } from "../../../components/pageIrSourceReview";
import { ARTIFACTS, type Intake, type RunState } from "../../../lib/contracts";
import { loadPageIrSourceBundleForReview } from "../../../lib/pageIrPipeline";
import { requiredReferenceContext } from "../../../lib/referenceContext";
import { loadArtifact, loadRun, RunNotFoundError } from "../../../lib/runstate";
import { classifyPersistedIntakeCompatibility } from "../../../lib/productionTarget";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) notFound();
  const run = await loadEvidenceRun(id);
  const intake = await loadArtifact<Intake>(id, ARTIFACTS.intake);
  const compatibility = intake
    ? classifyPersistedIntakeCompatibility(intake)
    : undefined;
  const pageIrSourceReview = await loadPageIrSourceReview(run);
  return (
    <EvidenceWorkspace
      initialRun={run}
      initialPageIrSourceReview={pageIrSourceReview}
      compatibility={compatibility}
      requiredReferenceContext={requiredReferenceContext(
        run.referenceMode,
        intake
      )}
    />
  );
}

function isMissingPageIrSourceBundle(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function loadPageIrSourceReview(run: RunState) {
  if (run.layoutAuthority !== "page-ir-v1") return null;
  try {
    return toPageIrSourceReviewView(
      await loadPageIrSourceBundleForReview(run.id),
    );
  } catch (error) {
    if (isMissingPageIrSourceBundle(error)) return null;
    throw error;
  }
}

async function loadEvidenceRun(id: string) {
  try {
    return await loadRun(id);
  } catch (error) {
    if (error instanceof RunNotFoundError) notFound();
    throw error;
  }
}
