"use client";

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
  uploadRecoveryMessage?: string | null;
  onUploadRecoveryClear?: () => void;
  disabled?: boolean;
}

const TARGETS: Array<{ value: ProjectTarget; label: string }> = [
  { value: "website", label: "Website" },
  { value: "web-app", label: "Web app" },
  { value: "ios-app", label: "iOS app" },
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
  uploadRecoveryMessage,
  onUploadRecoveryClear,
  disabled = false,
}: IntakeControlsProps) {
  return (
    <div className="intake-controls">
      <fieldset className="intake-control">
        <legend>Project target</legend>
        <div className="intake-segmented">
          {TARGETS.map((target) => (
            <label key={target.value}>
              <input
                type="radio"
                name="project-target"
                value={target.value}
                checked={projectTarget === target.value}
                onChange={() => onProjectTargetChange(target.value)}
                disabled={disabled}
              />
              <span>{target.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="intake-control intake-research">
        <legend>Design Research</legend>
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
              Collect business context and separate design-reference evidence.
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
              checked={research.referoDesignEvidence}
              onChange={(event) =>
                onResearchChange({
                  ...research,
                  referoDesignEvidence: event.target.checked,
                })
              }
              disabled={disabled || !research.enabled}
            />
            Design-reference evidence
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
      </fieldset>

      <UploadPanel
        uploads={uploads}
        onChange={onUploadsChange}
        uploadSession={uploadSession}
        onUploadSessionChange={onUploadSessionChange}
        externalSessionError={uploadRecoveryMessage}
        onExternalSessionErrorClear={onUploadRecoveryClear}
        disabled={disabled}
      />
    </div>
  );
}
