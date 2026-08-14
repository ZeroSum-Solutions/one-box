export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_UPLOADS = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".zip": ["application/zip", "application/x-zip-compressed"],
} as const;

export type AcceptedUploadExtension = keyof typeof ACCEPTED_UPLOADS;

export const UPLOAD_ACCEPT_ATTRIBUTE = Object.entries(ACCEPTED_UPLOADS)
  .flatMap(([extension, mediaTypes]) => [extension, ...mediaTypes])
  .join(",");

export const UPLOAD_TYPE_COPY =
  "PNG, JPG, WebP, PDF, TXT, Markdown, DOC, DOCX, or ZIP";

export function uploadExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}
