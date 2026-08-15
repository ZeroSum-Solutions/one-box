import { describe, expect, it } from "vitest";
import {
  ACCEPTED_UPLOADS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_TYPE_COPY,
  uploadExtension,
} from "./uploadPolicy";

describe("upload policy", () => {
  it("keeps the upload count, byte limit, and visible type copy stable", () => {
    expect(MAX_UPLOAD_FILES).toBe(5);
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(UPLOAD_TYPE_COPY).toBe(
      "PNG, JPG, WebP, PDF, TXT, Markdown, DOC, DOCX, or ZIP"
    );
  });

  it("keeps the accepted extension and MIME matrix stable", () => {
    expect(ACCEPTED_UPLOADS).toEqual({
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
    });
  });

  it("keeps the browser accept attribute ordered and complete", () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toBe(
      ".png,image/png,.jpg,image/jpeg,.jpeg,image/jpeg,.webp,image/webp,.pdf,application/pdf,.txt,text/plain,.md,text/markdown,text/plain,.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.zip,application/zip,application/x-zip-compressed"
    );
  });

  it("uses the final case-insensitive extension", () => {
    expect(uploadExtension("brand.GUIDE.PDF")).toBe(".pdf");
    expect(uploadExtension("archive.tar.ZIP")).toBe(".zip");
    expect(uploadExtension("README")).toBe("");
  });
});
