"use client";

import { useRef } from "react";
import type {
  ProjectTarget,
  ResearchConfiguration,
  UploadMetadata,
} from "@/lib/contracts";
import { UploadPanel } from "./UploadPanel";
import {
  FIRECRAWL_CONSENT_HELP,
  FIRECRAWL_CONSENT_LABEL,
} from "./researchConsent";

interface IntakeControlsProps {
  projectTarget: ProjectTarget;
  research: ResearchConfiguration;
  uploads: UploadMetadata[];
  uploadSession: string | null;
  onProjectTargetChange: (target: ProjectTarget) => void;
  onResearchChange: (research: ResearchConfiguration) => void;
  onUploadsChange: (uploads: UploadMetadata[]) => void;
  onUploadSessionChange: (handle: string | null) => void;
  referoDesignEvidenceAvailable: boolean;
  uploadRecoveryMessage?: string | null;
  onUploadRecoveryClear?: () => void;
  disabled?: boolean;
}

const TARGETS: Array<{
  value: ProjectTarget;
  label: string;
  outcome: string;
  tooling: string;
  context: string;
}> = [
  {
    value: "website",
    label: "Website",
    outcome:
      "A responsive public-facing site for marketing, information, lead generation, or sales.",
    tooling:
      "Built as a responsive Next.js and Tailwind CSS site, with motion only where it improves the experience.",
    context:
      "Website selected. Describe the company, audience, pages, and action you want visitors to take.",
  },
  {
    value: "web-app",
    label: "Web app",
    outcome:
      "An interactive browser product with screens, workflows, and application behavior.",
    tooling:
      "Structured as a Next.js browser application; data, accounts, integrations, and deployment follow the scope you describe.",
    context:
      "Web app selected. Describe the users, core workflow, important screens, and what success looks like.",
  },
  {
    value: "ios-app",
    label: "iOS app",
    outcome:
      "A touch-first iPhone experience with mobile navigation and platform-appropriate interactions.",
    tooling:
      "Focused on iPhone screens and interaction design; native packaging is not implied unless the project scope includes it.",
    context:
      "iOS app selected. Describe the users, main mobile task, essential screens, and device capabilities it needs.",
  },
];

export function IntakeControls({
  projectTarget,
  research,
  uploads,
  uploadSession,
  onProjectTargetChange,
  onResearchChange,
  onUploadsChange,
  onUploadSessionChange,
  referoDesignEvidenceAvailable,
  uploadRecoveryMessage,
  onUploadRecoveryClear,
  disabled = false,
}: IntakeControlsProps) {
  const targetMenuRef = useRef<HTMLDetailsElement>(null);
  const selectedTarget =
    TARGETS.find((target) => target.value === projectTarget) ?? TARGETS[0];

  return (
    <div className="intake-controls">
      <UploadPanel
        uploads={uploads}
        onChange={onUploadsChange}
        uploadSession={uploadSession}
        onUploadSessionChange={onUploadSessionChange}
        externalSessionError={uploadRecoveryMessage}
        onExternalSessionErrorClear={onUploadRecoveryClear}
        disabled={disabled}
        compact
      />

      <details
        className="intake-target"
        ref={targetMenuRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.open = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
          }
        }}
      >
        <summary
          className="intake-target__summary"
          aria-label="Choose project outcome"
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) event.preventDefault();
          }}
        >
          {selectedTarget.label}
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="intake-target__menu">
          <div className="intake-target__options" role="radiogroup" aria-label="Project target">
            {TARGETS.map((target) => (
              <label key={target.value} className="intake-target__option">
                <input
                  type="radio"
                  name="project-target"
                  value={target.value}
                  checked={projectTarget === target.value}
                  onChange={() => {
                    onProjectTargetChange(target.value);
                    if (targetMenuRef.current) targetMenuRef.current.open = false;
                  }}
                  disabled={disabled}
                />
                <span>
                  <strong>{target.label}</strong>
                  <small>{target.outcome}</small>
                  <small>{target.tooling}</small>
                </span>
              </label>
            ))}
          </div>

          <details className="intake-research">
            <summary>Research settings</summary>
            <div className="intake-research__panel" role="group" aria-label="Design Research">
              <label className="intake-toggle">
                <input
                  type="checkbox"
                  checked={research.enabled}
                  onChange={(event) =>
                    onResearchChange({ ...research, enabled: event.target.checked })
                  }
                  disabled={disabled}
                />
                <span>
                  <strong>Use research before generation</strong>
                  <small>
                    Gather business, competitor, and design-reference evidence before the build.
                  </small>
                </span>
              </label>
              <div className="intake-research__options">
                <label>
                  <input
                    type="checkbox"
                    checked={research.businessIntelligence}
                    onChange={(event) =>
                      onResearchChange({
                        ...research,
                        businessIntelligence: event.target.checked,
                      })
                    }
                    disabled={disabled || !research.enabled}
                  />
                  Business and competitor context
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="refero-design-evidence"
                    checked={research.referoDesignEvidence}
                    onChange={(event) =>
                      onResearchChange({
                        ...research,
                        referoDesignEvidence: event.target.checked,
                      })
                    }
                    disabled={
                      disabled ||
                      !research.enabled ||
                      !referoDesignEvidenceAvailable
                    }
                  />
                  <span>
                    Design-reference evidence
                    {!referoDesignEvidenceAvailable && (
                      <small>
                        Unavailable in this session. Leave this off, or add the
                        Refero runtime token and restart ONE BOX.
                      </small>
                    )}
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={research.allowPaidFirecrawlFallback}
                    onChange={(event) =>
                      onResearchChange({
                        ...research,
                        allowPaidFirecrawlFallback: event.target.checked,
                      })
                    }
                    disabled={disabled || !research.enabled}
                  />
                  <span>
                    {FIRECRAWL_CONSENT_LABEL}
                    <small>{FIRECRAWL_CONSENT_HELP}</small>
                  </span>
                </label>
              </div>
            </div>
          </details>
          <button
            type="button"
            className="intake-target__done"
            onClick={() => {
              if (targetMenuRef.current) targetMenuRef.current.open = false;
            }}
          >
            Done
          </button>
        </div>
      </details>

      <p className="intake-target__context" aria-live="polite">
        {selectedTarget.context}
      </p>
    </div>
  );
}
