"use client";

import type { FormEvent, KeyboardEvent, ReactNode } from "react";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  rows?: number;
  /** Extra control rendered next to the submit button (e.g. an image-intent toggle). */
  extra?: ReactNode;
}

/** The one composer used by both the hero chat and the preview edit rail —
 * rounded dark panel, cream text, ghost pill submit. Enter sends, Shift+Enter
 * inserts a newline. */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  submitLabel = "Send",
  rows = 3,
  extra,
}: ChatComposerProps) {
  const canSubmit = !disabled && value.trim().length > 0;

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
        <button type="submit" className="pill-button" disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
