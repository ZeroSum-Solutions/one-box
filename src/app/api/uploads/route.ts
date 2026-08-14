import {
  MAX_MULTIPART_BODY_BYTES,
  UploadError,
  inspectUpload,
  inspectZip,
  stageUploads,
} from "../../../lib/uploads";
import { MAX_UPLOAD_FILES } from "../../../components/uploadPolicy";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";

export { inspectUpload, inspectZip };

export const runtime = "nodejs";

const BOUNDARY_PATTERN = /^[0-9A-Za-z'()+_,\-./:=?]{1,70}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function multipartBoundary(contentType: string | null): string {
  if (!contentType || !/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new UploadError("Content-Type must be multipart/form-data.", 400);
  }
  const match = contentType.match(
    /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))(?:;|$)/i
  );
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || !BOUNDARY_PATTERN.test(boundary)) {
    throw new UploadError("The multipart boundary is missing or invalid.", 400);
  }
  return boundary;
}

function bearerHandle(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  if (
    process.env.ONE_BOX_API_TOKEN &&
    authorization === `Bearer ${process.env.ONE_BOX_API_TOKEN}`
  ) {
    return undefined;
  }
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match) throw new UploadError("The upload session handle is invalid.", 401);
  return match[1];
}

function uploadRequestId(value: string | null): string {
  if (!value || !REQUEST_ID_PATTERN.test(value)) {
    throw new UploadError("The upload request id is missing or invalid.");
  }
  return value;
}

/** Buffer only after incrementally enforcing the aggregate body cap. */
export async function readBoundedBody(
  request: Request,
  maxBytes = MAX_MULTIPART_BODY_BYTES
): Promise<Uint8Array> {
  if (!request.body) throw new UploadError("The upload body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UploadError("The upload request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function boundedFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  multipartBoundary(contentType);
  const body = await readBoundedBody(request);
  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType! },
      body: body.buffer as ArrayBuffer,
    }).formData();
  } catch {
    throw new UploadError("The multipart upload could not be parsed.", 400);
  }
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.arrayBuffer === "function";
}

export async function handleUpload(
  request: Request,
  stagingRoot?: string
): Promise<Response> {
  try {
    // Authorize before inspecting multipart headers or consuming a single body
    // byte. Otherwise a hostile site can spend this local service's staging
    // quota with a cross-origin form POST.
    if (!isLocalApiAuthorized(request)) {
      throw new UploadError("Cross-origin uploads are not allowed.", 403);
    }
    const handle = bearerHandle(request.headers.get("authorization"));
    const formData = await boundedFormData(request);
    const multipartEntries = Array.from(formData.entries());
    if (multipartEntries.some(([name]) => name !== "files")) {
      throw new UploadError("Only files fields are accepted.");
    }
    const entries = multipartEntries.map(([, value]) => value);
    if (entries.length === 0 || entries.length > MAX_UPLOAD_FILES) {
      throw new UploadError(
        `Upload between 1 and ${MAX_UPLOAD_FILES} files at a time.`
      );
    }
    if (!entries.every(isFile)) {
      throw new UploadError("Every files field must contain a file.");
    }

    const requestId = uploadRequestId(
      request.headers.get("x-one-box-upload-request-id")
    );
    const result = await stageUploads(entries, {
      handle,
      requestId,
      stagingRoot,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return Response.json(
      { error: "The upload could not be staged. Try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleUpload(request);
}
