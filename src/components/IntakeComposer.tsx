"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  ProjectTarget,
  ResearchConfiguration,
  UploadMetadata,
} from "@/lib/contracts";
import { IntakeControls } from "./IntakeControls";

export const GUIDANCE_PROMPTS = [
  "Tell us about the company you run or want to build.",
  "Share anything that will help us understand it.",
  "Choose Website, Web app, or iOS app.",
  "Try Research to sharpen the result.",
  "Add any files you want us to use.",
] as const;

interface IntakeComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  projectTarget: ProjectTarget;
  research: ResearchConfiguration;
  uploads: UploadMetadata[];
  uploadSession: string | null;
  onProjectTargetChange: (target: ProjectTarget) => void;
  onResearchChange: (research: ResearchConfiguration) => void;
  onUploadsChange: (uploads: UploadMetadata[]) => void;
  onUploadSessionChange: (handle: string | null) => void;
  referoDesignEvidenceAvailable: boolean;
  referoConnectUrl: string;
  uploadRecoveryMessage?: string | null;
  onUploadRecoveryClear?: () => void;
  disabled?: boolean;
  submitLabel?: string;
}

export function boundedComposerHeight(
  scrollHeight: number,
  viewportHeight: number
): { height: number; overflow: boolean } {
  const maximum = Math.max(120, Math.min(360, Math.floor(viewportHeight * 0.5)));
  const minimum = Math.min(144, maximum);
  return {
    height: Math.max(minimum, Math.min(scrollHeight, maximum)),
    overflow: scrollHeight > maximum,
  };
}

export function IntakeComposer({
  value,
  onChange,
  onSubmit,
  projectTarget,
  research,
  uploads,
  uploadSession,
  onProjectTargetChange,
  onResearchChange,
  onUploadsChange,
  onUploadSessionChange,
  referoDesignEvidenceAvailable,
  referoConnectUrl,
  uploadRecoveryMessage,
  onUploadRecoveryClear,
  disabled = false,
  submitLabel = "Send",
}: IntakeComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [guidanceIndex, setGuidanceIndex] = useState(0);
  const [guidanceStopped, setGuidanceStopped] = useState(false);
  const canSubmit = !disabled && value.trim().length > 0;

  useEffect(() => {
    if (guidanceStopped || value.length > 0) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const interval = window.setInterval(() => {
      setGuidanceIndex((index) => (index + 1) % GUIDANCE_PROMPTS.length);
    }, 4800);
    return () => window.clearInterval(interval);
  }, [guidanceStopped, value.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function resize() {
      if (!textarea) return;
      textarea.style.height = "auto";
      const size = boundedComposerHeight(textarea.scrollHeight, window.innerHeight);
      textarea.style.height = `${size.height}px`;
      textarea.style.overflowY = size.overflow ? "auto" : "hidden";
    }

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);

  function stopGuidance() {
    setGuidanceStopped(true);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <form className="intake-composer" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="composer__input intake-composer__input"
        value={value}
        onChange={(event) => {
          stopGuidance();
          onChange(event.target.value);
        }}
        onFocus={stopGuidance}
        onPaste={stopGuidance}
        onKeyDown={handleKeyDown}
        placeholder={GUIDANCE_PROMPTS[guidanceIndex]}
        rows={6}
        disabled={disabled}
        aria-label="Describe your project"
      />
      <div className="intake-composer__footer">
        <IntakeControls
          projectTarget={projectTarget}
          research={research}
          uploads={uploads}
          uploadSession={uploadSession}
          onProjectTargetChange={onProjectTargetChange}
          onResearchChange={onResearchChange}
          onUploadsChange={onUploadsChange}
          onUploadSessionChange={onUploadSessionChange}
          referoDesignEvidenceAvailable={referoDesignEvidenceAvailable}
          referoConnectUrl={referoConnectUrl}
          uploadRecoveryMessage={uploadRecoveryMessage}
          onUploadRecoveryClear={onUploadRecoveryClear}
          disabled={disabled}
        />
        <button
          type="submit"
          className="btn-primary intake-composer__send"
          disabled={!canSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
