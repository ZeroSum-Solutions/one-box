/**
 * Credential preflight — run BEFORE stage 1 spends anything.
 *
 * Live failure this exists to prevent (run 2KJ9KwYM4SeA, 2026-08-13): the dev
 * server was started without Refero authorization. Authentication was checked
 * lazily on first use, which is stage 3, so the run bought a full
 * competitive scan — 147 seconds and ~$0.05 of Firecrawl + OpenRouter — and
 * only THEN discovered it could never finish. Re-running just repeated the
 * spend: missing authorization does not heal on retry.
 *
 * Everything a run will need is therefore checked up front, against the
 * reference mode it will actually use. Missing = fail immediately, before the
 * first paid call. Advisory = degraded feature, run proceeds.
 */
import type { ReferenceMode } from "./contracts";
import { referoCredentialsAvailable } from "./referoAuth";

export interface PreflightIssue {
  /** env var name */
  key: string;
  /** what breaks without it */
  message: string;
  /** how to supply it */
  fix: string;
}

export interface PreflightResult {
  ok: boolean;
  /** run cannot proceed */
  blocking: PreflightIssue[];
  /** run proceeds with a feature degraded */
  advisory: PreflightIssue[];
}

export interface PreflightCapabilities {
  businessResearch?: boolean;
  referenceResearch?: boolean;
  allowPaidFirecrawlFallback?: boolean;
}

const DEV_HINT = "start the server with npm run dev, which sources ZS Vault";

export function preflight(
  mode: ReferenceMode = "refero",
  capabilities: PreflightCapabilities = {}
): PreflightResult {
  const businessResearch = capabilities.businessResearch ?? true;
  const referenceResearch = capabilities.referenceResearch ?? true;
  const blocking: PreflightIssue[] = [];
  const advisory: PreflightIssue[] = [];

  if (!process.env.OPENROUTER_API_KEY) {
    blocking.push({
      key: "OPENROUTER_API_KEY",
      message: "every model call in the pipeline",
      fix: DEV_HINT,
    });
  }
  if (
    businessResearch &&
    capabilities.allowPaidFirecrawlFallback === true &&
    !process.env.FIRECRAWL_API_KEY
  ) {
    blocking.push({
      key: "FIRECRAWL_API_KEY",
      message: "competitor discovery (stage: scan)",
      fix: DEV_HINT,
    });
  }
  // Only the Refero arm needs an OAuth session (or legacy bearer token). The local/none A/B arms must
  // still run on a machine that has never had one.
  if (referenceResearch && mode === "refero" && !referoCredentialsAvailable()) {
    blocking.push({
      key: "REFERO_OAUTH",
      message: "the Refero reference lock (stage: locked)",
      fix: "open /api/refero/connect in ONE BOX and complete browser authorization",
    });
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    advisory.push({
      key: "GOOGLE_MAPS_API_KEY",
      message: "map embed + Google Places competitor verification",
      fix: "needs a Maps Platform key — the vault's google_api_key is AI-Studio-only and Places rejects it",
    });
  }

  return { ok: blocking.length === 0, blocking, advisory };
}

/** Thrown before any spend. Distinct type so callers can tell a configuration
 * problem (never retry — fix the environment) from a runtime failure (resume
 * is meaningful). */
export class ConfigError extends Error {
  readonly issues: PreflightIssue[];

  constructor(issues: PreflightIssue[]) {
    super(
      `missing configuration — nothing was spent. ${issues
        .map((i) => `${i.key} (needed for ${i.message}) → ${i.fix}`)
        .join(" | ")}`
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}
