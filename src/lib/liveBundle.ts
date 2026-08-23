import { createHash } from "node:crypto";
import type { CandidateFileRecord } from "./contracts";

export const LIVE_BUNDLE_METADATA_DIR = ".one-box";
export const LIVE_BUNDLE_MANIFEST_FILE = "candidate-manifest.json";
export const LIVE_BUNDLE_PROVENANCE_FILE = "provenance.json";
export const LIVE_BUNDLE_GATES_FILE = "gates.json";

export function candidateBuildSha256(files: CandidateFileRecord[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.sizeBytes));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}
