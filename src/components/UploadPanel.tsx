"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { UploadMetadata } from "@/lib/contracts";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_TYPE_COPY,
} from "../features/uploads/policy";

interface UploadPanelProps {
  uploads: UploadMetadata[];
  onChange: (uploads: UploadMetadata[]) => void;
  uploadSession: string | null;
  onUploadSessionChange: (handle: string | null) => void;
  externalSessionError?: string | null;
  onExternalSessionErrorClear?: () => void;
  disabled?: boolean;
  compact?: boolean;
  review?: boolean;
}

interface UploadResponse {
  uploads?: UploadMetadata[];
  uploadSession?: string;
  expiresAt?: string;
  error?: string;
}

interface UploadFailure {
  kind: "authorization" | "validation" | "request";
  message: string;
  technicalDetails?: string;
}

export function UploadPanel({
  uploads,
  onChange,
  uploadSession,
  onUploadSessionChange,
  externalSessionError = null,
  onExternalSessionErrorClear,
  disabled = false,
  compact = false,
  review = false,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [failedRequestId, setFailedRequestId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const addFilesDisabled =
    disabled || isUploading || uploads.length >= MAX_UPLOAD_FILES;
  const externalExpiryActive = Boolean(
    externalSessionError && !uploadSession && uploads.length === 0
  );
  const recoveryActive = sessionExpired || externalExpiryActive;
  const visibleError = failure?.message || (externalExpiryActive ? externalSessionError : null);

  function resetAndReselect() {
    onUploadSessionChange(null);
    onChange([]);
    setSessionExpired(false);
    setFailure(null);
    setFailedFiles([]);
    setFailedRequestId(null);
    onExternalSessionErrorClear?.();
    inputRef.current?.click();
  }

  async function uploadFiles(files: File[], requestId: string) {
    setFailure(null);
    setSessionExpired(false);

    if (files.length === 0) return;
    onExternalSessionErrorClear?.();
    if (uploads.length + files.length > MAX_UPLOAD_FILES) {
      setFailedFiles([]);
      setFailedRequestId(null);
      setFailure({
        kind: "validation",
        message: `Choose no more than ${MAX_UPLOAD_FILES} files total.`,
      });
      return;
    }
    const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      setFailedFiles([]);
      setFailedRequestId(null);
      setFailure({
        kind: "validation",
        message: `${oversized.name} is larger than 10 MiB.`,
      });
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    setIsUploading(true);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: uploadSession
          ? {
              Authorization: `Bearer ${uploadSession}`,
              "X-One-Box-Upload-Request-Id": requestId,
            }
          : { "X-One-Box-Upload-Request-Id": requestId },
        body: formData,
      });
      if (response.status === 401) {
        onUploadSessionChange(null);
        onChange([]);
        setFailedFiles([]);
        setFailedRequestId(null);
        setSessionExpired(true);
        setFailure({
          kind: "request",
          message: "Your private upload session expired. Its previous file selections were cleared.",
        });
        return;
      }
      let body: UploadResponse = {};
      try {
        body = (await response.json()) as UploadResponse;
      } catch {
        // Status-specific recovery below does not depend on a JSON response.
      }
      if (response.status === 403) {
        setFailedFiles(files);
        setFailedRequestId(requestId);
        setFailure({
          kind: "authorization",
          message: "OneBox could not upload this file because the local request was blocked. The file has not left your device.",
          technicalDetails: `Upload request failed (403).${body.error ? ` ${body.error}` : ""}`,
        });
        return;
      }
      if (!response.ok || !body.uploads || !body.uploadSession) {
        const retryable = response.status >= 500 || response.status === 0;
        setFailedFiles(retryable ? files : []);
        setFailedRequestId(retryable ? requestId : null);
        setFailure({
          kind: retryable ? "request" : "validation",
          message:
            body.error ||
            (retryable
              ? "OneBox could not upload this file. Try again."
              : `Upload failed (${response.status}).`),
          technicalDetails: retryable
            ? `Upload request failed (${response.status}).`
            : undefined,
        });
        return;
      }
      if (uploadSession && body.uploadSession !== uploadSession) {
        throw new Error("The upload session changed unexpectedly.");
      }
      onUploadSessionChange(body.uploadSession);
      onChange([...uploads, ...body.uploads]);
      setFailedFiles([]);
      setFailedRequestId(null);
      setFailure(null);
      onExternalSessionErrorClear?.();
    } catch (uploadError) {
      const technicalDetails =
        uploadError instanceof Error ? uploadError.message : "Upload failed.";
      setFailedFiles(files);
      setFailedRequestId(requestId);
      setFailure({
        kind: "request",
        message: "OneBox could not reach the local upload service. Your selected file is still available to retry.",
        technicalDetails,
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setFailedFiles([]);
    setFailedRequestId(null);
    await uploadFiles(files, crypto.randomUUID());
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (addFilesDisabled) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    await uploadFiles(files, crypto.randomUUID());
  }

  const uploadedFileList = uploads.length > 0 && (
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
            onClick={() => {
              const remaining = uploads.filter((item) => item.id !== upload.id);
              onChange(remaining);
              if (review && remaining.length === 0) onUploadSessionChange(null);
            }}
            disabled={disabled || isUploading}
            aria-label={`Remove ${upload.fileName}`}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );

  const failedFileList = failedFiles.length > 0 && (
    <ul className="intake-upload__list" aria-label="Files not uploaded">
      {failedFiles.map((file) => (
        <li key={`${file.name}-${file.size}-${file.lastModified}`}>
          <span>
            {file.name} · Not uploaded
            <small>The selected file is retained in this browser session for retry.</small>
          </span>
          <button
            type="button"
            onClick={() => {
              setFailedFiles([]);
              setFailedRequestId(null);
              setFailure(null);
            }}
            disabled={disabled || isUploading}
            aria-label={`Remove ${file.name}`}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );

  const errorPanel = visibleError && (
    <div className="intake-upload__error" role="alert">
      <p>
        {visibleError}{" "}
        {recoveryActive
          ? "Choose the files again to start a fresh private session."
          : failure?.kind === "validation"
            ? "Rejected files remain on your device; adjust the selection and try again."
            : failedFiles.length > 0
              ? "Retry the upload or open technical details."
              : ""}
      </p>
      {failure?.technicalDetails && (
        <details>
          <summary>Technical details</summary>
          <code>{failure.technicalDetails}</code>
        </details>
      )}
      {!recoveryActive && failedFiles.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (failedRequestId) void uploadFiles(failedFiles, failedRequestId);
          }}
          disabled={disabled || isUploading}
        >
          {isUploading ? "Uploading…" : "Retry upload"}
        </button>
      )}
      {recoveryActive && (
        <button type="button" onClick={resetAndReselect} disabled={disabled || isUploading}>
          Choose files again
        </button>
      )}
    </div>
  );

  return (
    <section
      className={`intake-upload${compact ? " intake-upload--compact" : ""}${review ? " intake-upload--review" : ""}`}
      aria-label={compact || review ? "Project files" : undefined}
      aria-labelledby={compact || review ? undefined : "upload-heading"}
      data-dragging={review && isDragging ? "" : undefined}
      onDragEnter={review ? (event) => {
        event.preventDefault();
        if (!addFilesDisabled) setIsDragging(true);
      } : undefined}
      onDragOver={review ? (event) => event.preventDefault() : undefined}
      onDragLeave={review ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      } : undefined}
      onDrop={review ? handleDrop : undefined}
    >
      {review ? (
        <div className="review-upload__drop">
          <span>Drop files here</span>
          <span className="review-upload__or">or</span>
          <button
            type="button"
            className="intake-upload__button"
            onClick={() => inputRef.current?.click()}
            disabled={addFilesDisabled}
          >
            {isUploading ? "Uploading…" : "Attach files"}
          </button>
        </div>
      ) : <div className="intake-control__heading">
        {!compact && (
          <div>
            <h2 id="upload-heading">Project files</h2>
            <p>Add brand materials, screenshots, or copy for the build.</p>
          </div>
        )}
        <button
          type="button"
          className="intake-upload__button"
          onClick={() => inputRef.current?.click()}
          disabled={addFilesDisabled}
          aria-label={compact ? "Add files" : undefined}
          title={compact ? "Add files" : undefined}
        >
          {compact ? (
            <span aria-hidden="true">{isUploading ? "…" : "+"}</span>
          ) : isUploading ? (
            "Uploading…"
          ) : (
            "Add files"
          )}
        </button>
      </div>}
      {/* A click proxy, not a control: the button above opens it and already
        carries the accessible name. Leaving it in the a11y tree publishes a
        second, unreachable "choose files" input (axe: form elements must have
        labels) — it is hidden from assistive tech instead, which is safe
        because tabIndex={-1} keeps it out of the tab order too. */}
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
        aria-hidden="true"
      />
      {compact || review ? (
        (uploads.length > 0 || failedFiles.length > 0 || visibleError) && (
          <details className="intake-upload__disclosure" open={Boolean(visibleError)}>
            <summary>
              {failedFiles.length > 0
                ? `${failedFiles.length} not uploaded`
                : uploads.length === 1
                  ? uploads[0].fileName
                  : uploads.length > 1
                    ? `${uploads.length} files attached`
                    : "Upload details"}
            </summary>
            <div className="intake-upload__disclosure-body">
              <p className="intake-upload__policy">
                {UPLOAD_TYPE_COPY}. Up to 10 MiB each and {MAX_UPLOAD_FILES} files total.
                {review
                  ? " Files stay private and are recorded with this review. They do not change the site automatically."
                  : " Text can inform copy or design guidance after the build starts. Images, PDF, DOC, DOCX, and ZIP remain private review material and are not used automatically."}
                {" "}Unclaimed staging expires after 30 minutes.
              </p>
              {uploadedFileList}
              {failedFileList}
              {errorPanel}
            </div>
          </details>
        )
      ) : (
        <>
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
          {uploadedFileList}
          {failedFileList}
          {errorPanel}
        </>
      )}
    </section>
  );
}
