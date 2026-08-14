"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { UploadMetadata } from "@/lib/contracts";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_TYPE_COPY,
} from "./uploadPolicy";

interface UploadPanelProps {
  uploads: UploadMetadata[];
  onChange: (uploads: UploadMetadata[]) => void;
  uploadSession: string | null;
  onUploadSessionChange: (handle: string | null) => void;
  externalSessionError?: string | null;
  onExternalSessionErrorClear?: () => void;
  disabled?: boolean;
}

interface UploadResponse {
  uploads?: UploadMetadata[];
  uploadSession?: string;
  expiresAt?: string;
  error?: string;
}

export function UploadPanel({
  uploads,
  onChange,
  uploadSession,
  onUploadSessionChange,
  externalSessionError = null,
  onExternalSessionErrorClear,
  disabled = false,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const addFilesDisabled =
    disabled || isUploading || uploads.length >= MAX_UPLOAD_FILES;
  const externalExpiryActive = Boolean(
    externalSessionError && !uploadSession && uploads.length === 0
  );
  const recoveryActive = sessionExpired || externalExpiryActive;
  const visibleError = error || (externalExpiryActive ? externalSessionError : null);

  function resetAndReselect() {
    onUploadSessionChange(null);
    onChange([]);
    setSessionExpired(false);
    setError(null);
    onExternalSessionErrorClear?.();
    inputRef.current?.click();
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);
    setSessionExpired(false);

    if (files.length === 0) return;
    onExternalSessionErrorClear?.();
    if (uploads.length + files.length > MAX_UPLOAD_FILES) {
      setError(`Choose no more than ${MAX_UPLOAD_FILES} files total.`);
      return;
    }
    const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      setError(`${oversized.name} is larger than 10 MiB.`);
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    setIsUploading(true);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: uploadSession
          ? { Authorization: `Bearer ${uploadSession}` }
          : undefined,
        body: formData,
      });
      if (response.status === 401) {
        onUploadSessionChange(null);
        onChange([]);
        setSessionExpired(true);
        setError(
          "Your private upload session expired. Its previous file selections were cleared."
        );
        return;
      }
      let body: UploadResponse;
      try {
        body = (await response.json()) as UploadResponse;
      } catch {
        throw new Error(`Upload failed (${response.status}).`);
      }
      if (!response.ok || !body.uploads || !body.uploadSession) {
        throw new Error(body.error || `Upload failed (${response.status}).`);
      }
      if (uploadSession && body.uploadSession !== uploadSession) {
        throw new Error("The upload session changed unexpectedly.");
      }
      onUploadSessionChange(body.uploadSession);
      onChange([...uploads, ...body.uploads]);
      onExternalSessionErrorClear?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="intake-upload" aria-labelledby="upload-heading">
      <div className="intake-control__heading">
        <div>
          <h2 id="upload-heading">Project files</h2>
          <p>Add brand materials, screenshots, or copy for the build.</p>
        </div>
        <button
          type="button"
          className="intake-upload__button"
          onClick={() => inputRef.current?.click()}
          disabled={addFilesDisabled}
        >
          {isUploading ? "Uploading…" : "Add files"}
        </button>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        name="files"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        multiple
        onChange={handleFiles}
        disabled={addFilesDisabled}
        tabIndex={-1}
      />
      <p className="intake-upload__policy">
        {UPLOAD_TYPE_COPY}. Up to 10 MiB each and {MAX_UPLOAD_FILES} files total.
        Plain-text and Markdown files are read only after the build starts: copy
        documents inform copy, while named brand guides and do/don&apos;t or wish lists
        inform design. Images, PDF, DOC, DOCX, and ZIP are stored privately for
        review but are not used automatically in generation. ZIP archives are
        safety-checked and kept intact, never extracted. Chat receives metadata
        only. Unclaimed staging expires 30 minutes after the latest upload.
        Removing a file deselects it but does not erase staged bytes sooner.
      </p>
      {uploads.length > 0 && (
        <ul className="intake-upload__list" aria-label="Uploaded files">
          {uploads.map((upload) => (
            <li key={upload.id}>
              <span>
                {upload.fileName} · {(upload.sizeBytes / 1024).toFixed(0)} KiB
                <small>
                  {(["text/plain", "text/markdown"].includes(upload.mediaType))
                    ? upload.kind === "copy-document"
                      ? "Used as bounded copy context after the build starts."
                      : ["brand-guidelines", "do-dont-list", "wish-list"].includes(upload.kind)
                        ? "Used as bounded design guidance after the build starts."
                        : "Stored for review; this text is not used automatically."
                    : "Stored for review; this format is not used automatically."}
                </small>
              </span>
              <button
                type="button"
                onClick={() => onChange(uploads.filter((item) => item.id !== upload.id))}
                disabled={disabled || isUploading}
                aria-label={`Remove ${upload.fileName}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {visibleError && (
        <div className="intake-upload__error" role="alert">
          <p>
            {visibleError} {recoveryActive
              ? "Choose the files again to start a fresh private session."
              : "Rejected files remain on your device; adjust the selection and try again."}
          </p>
          {recoveryActive && (
            <button type="button" onClick={resetAndReselect} disabled={disabled || isUploading}>
              Choose files again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
