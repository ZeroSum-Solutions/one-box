import { notFound } from "next/navigation";
import { EvidenceWorkspace } from "@/components/EvidenceWorkspace";
import { ARTIFACTS, type Intake } from "@/lib/contracts";
import { requiredReferenceContext } from "@/lib/referenceContext";
import { loadArtifact, loadRun, RunNotFoundError } from "@/lib/runstate";
import { classifyPersistedIntakeCompatibility } from "@/lib/productionTarget";

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
  return (
    <EvidenceWorkspace
      initialRun={run}
      compatibility={compatibility}
      requiredReferenceContext={requiredReferenceContext(
        run.referenceMode,
        intake
      )}
    />
  );
}

async function loadEvidenceRun(id: string) {
  try {
    return await loadRun(id);
  } catch (error) {
    if (error instanceof RunNotFoundError) notFound();
    throw error;
  }
}
