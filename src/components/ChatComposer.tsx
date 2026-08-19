"use client";

import type { FormEvent, KeyboardEvent, ReactNode } from "react";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Disables the textarea AND the submit button — a busy/paused state. */
  disabled?: boolean;
  /** Disables ONLY the submit button while the textarea stays typable — a
   * scopeless draft with nowhere to send yet, not a paused composer. */
  submitDisabled?: boolean;
  submitLabel?: string;
  rows?: number;
  /** Extra control rendered next to the submit button (e.g. an image-intent toggle). */
  extra?: ReactNode;
}

/** The one composer used by both the hero chat and the preview edit rail —
 * carbon card, mist text, ghost submit (never the tool's promoted lime
 * action — see DESIGN.md "one acid-lime action per view"). Enter sends,
 * Shift+Enter inserts a newline. */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  submitDisabled = false,
  submitLabel = "Send",
  rows = 3,
  extra,
}: ChatComposerProps) {
  const canSubmit = !disabled && !submitDisabled && value.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={placeholder ?? "Message"}
      />
      <div className="composer__row">
        {extra ?? <span />}
        <button type="submit" className="btn-ghost" disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
