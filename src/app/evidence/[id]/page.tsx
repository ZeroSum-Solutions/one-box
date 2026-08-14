import { notFound } from "next/navigation";
import { EvidenceWorkspace } from "@/components/EvidenceWorkspace";
import { loadRun, RunNotFoundError } from "@/lib/runstate";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) notFound();
  const run = await loadEvidenceRun(id);
  return <EvidenceWorkspace initialRun={run} />;
}

async function loadEvidenceRun(id: string) {
  try {
    return await loadRun(id);
  } catch (error) {
    if (error instanceof RunNotFoundError) notFound();
    throw error;
  }
}
