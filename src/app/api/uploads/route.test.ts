import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "../../../components/uploadPolicy";
import {
  claimUploadSession,
  buildRunUploadContext,
  cleanupUploadSessions,
  inspectUpload,
  readRunUpload,
  stageUploads,
} from "../../../lib/uploads";
import { createRun, sitePaths } from "../../../lib/runstate";
import { handleUpload, readBoundedBody } from "./route";

const temporaryDirectories: string[] = [];
const testRunIds: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
    ...testRunIds
      .splice(0)
      .map((runId) => rm(sitePaths(runId).root, { recursive: true, force: true })),
  ]);
});

async function stagingRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "one-box-upload-"));
  temporaryDirectories.push(root);
  return root;
}

function uploadRequest(
  files: File[],
  uploadSession?: string,
  extraHeaders: HeadersInit = {}
): Request {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const headers = new Headers(extraHeaders);
  if (!headers.has("Origin")) headers.set("Origin", "http://localhost");
  if (uploadSession) headers.set("Authorization", `Bearer ${uploadSession}`);
  return new Request("http://localhost/api/uploads", {
    method: "POST",
    headers,
    body: formData,
  });
}

function textFile(name: string, content = "Approved homepage copy"): File {
  return new File([content], name, { type: "text/plain" });
}

function storedZip(entryName: string, content = "safe"): ArrayBuffer {
  const name = Buffer.from(entryName, "utf8");
  const data = Buffer.from(content, "utf8");
  const local = Buffer.alloc(30 + name.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  data.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  const archive = Buffer.concat([local, central, eocd]);
  return archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer;
}

describe("bounded multipart handling", () => {
  it("rejects an untrusted Origin before reading or staging the body", async () => {
    const root = await stagingRoot();
    let bodyReads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyReads += 1;
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: {
        Origin: "https://hostile.example",
        "Content-Type": "multipart/form-data; boundary=valid-boundary",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    // Node's Request constructor may prime a pull immediately; authorization
    // must not cause any additional body reads.
    await Promise.resolve();
    const readsBeforeHandler = bodyReads;
    const response = await handleUpload(request, root);

    expect(response.status).toBe(403);
    expect(bodyReads).toBe(readsBeforeHandler);
    expect(await readdir(root)).toEqual([]);
  });

  it("preserves same-origin browser and bearer-authorized local upload behavior", async () => {
    const root = await stagingRoot();
    const sameOrigin = await handleUpload(
      uploadRequest([textFile("same-origin.txt")], undefined, {
        Origin: "http://localhost",
      }),
      root
    );
    expect(sameOrigin.status).toBe(200);

    const previousToken = process.env.ONE_BOX_API_TOKEN;
    process.env.ONE_BOX_API_TOKEN = "test-local-token";
    try {
      const bearerRequest = uploadRequest([textFile("local.txt")], undefined, {
          Authorization: "Bearer test-local-token",
        });
      bearerRequest.headers.delete("Origin");
      const bearer = await handleUpload(bearerRequest, root);
      expect(bearer.status).toBe(200);
    } finally {
      if (previousToken === undefined) delete process.env.ONE_BOX_API_TOKEN;
      else process.env.ONE_BOX_API_TOKEN = previousToken;
    }
  });

  it("caps a chunked body without relying on Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedBody(request, 5)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("rejects a missing multipart boundary before parsing", async () => {
    const response = await handleUpload(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "multipart/form-data",
        },
        body: "not multipart",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "The multipart boundary is missing or invalid.",
    });

    const invalid = await handleUpload(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "multipart/form-data; boundary=bad boundary",
        },
        body: "not multipart",
      })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: "The multipart boundary is missing or invalid.",
    });
  });
});

describe("upload validation", () => {
  it("rejects unsupported or spoofed file types", async () => {
    await expect(
      inspectUpload(
        new File(["not an image"], "logo.png", { type: "image/png" })
      )
    ).rejects.toThrow("contents do not match");
    await expect(
      inspectUpload(
        new File(["binary"], "payload.exe", {
          type: "application/octet-stream",
        })
      )
    ).rejects.toThrow("not an accepted file type");
  });

  it("rejects files larger than 10 MiB", async () => {
    const oversized = new File(
      [new Uint8Array(MAX_UPLOAD_BYTES + 1)],
      "copy.txt",
      { type: "text/plain" }
    );
    await expect(inspectUpload(oversized)).rejects.toThrow("larger than 10 MiB");
  });

  it("rejects ZIP path traversal", async () => {
    const archive = new File([storedZip("../secret.txt")], "materials.zip", {
      type: "application/zip",
    });
    await expect(inspectUpload(archive)).rejects.toThrow("ZIP archive is malformed");
  });
});

describe("upload-session lifecycle", () => {
  it("returns a bearer handle, retains it across appends, and enforces cumulative count", async () => {
    const root = await stagingRoot();
    const first = await handleUpload(
      uploadRequest([
        textFile("one.txt"),
        textFile("two.txt"),
        textFile("three.txt"),
      ]),
      root
    );
    const firstBody = (await first.json()) as {
      uploadSession: string;
      uploads: Array<{ id: string }>;
    };
    expect(first.status).toBe(200);
    expect(firstBody.uploadSession).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const firstDirectory = path.join(
      root,
      createHash("sha256").update(firstBody.uploadSession).digest("hex")
    );
    const firstEntries = await readdir(firstDirectory);
    expect(firstEntries).toContain("manifest.json");
    expect(firstEntries).toHaveLength(4);

    const second = await handleUpload(
      uploadRequest(
        [textFile("four.txt"), textFile("five.txt")],
        firstBody.uploadSession
      ),
      root
    );
    const secondBody = (await second.json()) as {
      uploadSession: string;
      uploads: Array<{ id: string }>;
    };
    expect(second.status).toBe(200);
    expect(secondBody.uploadSession).toBe(firstBody.uploadSession);

    const excess = await handleUpload(
      uploadRequest([textFile("six.txt")], firstBody.uploadSession),
      root
    );
    expect(excess.status).toBe(413);
    await expect(excess.json()).resolves.toMatchObject({
      error: "An upload session accepts at most 5 files and 50 MiB total.",
    });
  });

  it("enforces a cumulative global staging quota", async () => {
    const root = await stagingRoot();
    await stageUploads([textFile("one.txt", "12345")], {
      stagingRoot: root,
      maxStagingBytes: 1_000,
    });
    await expect(
      stageUploads([textFile("two.txt", "67890")], {
        stagingRoot: root,
        maxStagingBytes: 5,
      })
    ).rejects.toMatchObject({ status: 507 });
  });

  it("cleans abandoned sessions after the 30-minute TTL", async () => {
    const root = await stagingRoot();
    await stageUploads([textFile("copy.txt")], {
      stagingRoot: root,
      nowMs: 0,
      ttlMs: 10,
    });
    expect(await readdir(root)).toHaveLength(1);
    await cleanupUploadSessions(root, 11);
    expect(await readdir(root)).toEqual([]);
  });

  it("claims authoritative bytes beneath a run exactly once", async () => {
    const root = await stagingRoot();
    const staged = await stageUploads([textFile("copy.txt")], {
      stagingRoot: root,
    });
    const runId = await createRun();
    testRunIds.push(runId);
    const claimed = await claimUploadSession(
      staged.uploadSession,
      [staged.uploads[0].id],
      runId,
      root
    );

    expect(claimed[0]).toMatchObject({
      id: staged.uploads[0].id,
      fileName: "copy.txt",
      storagePath: expect.stringMatching(/^uploads\//),
    });
    expect(new TextDecoder().decode(await readRunUpload(runId, claimed[0].id))).toBe(
      "Approved homepage copy"
    );
    await expect(
      claimUploadSession(
        staged.uploadSession,
        [staged.uploads[0].id],
        runId,
        root
      )
    ).rejects.toMatchObject({ status: 401 });
  });

  it("keeps an atomic claim committed when post-rename cleanup fails", async () => {
    const root = await stagingRoot();
    const staged = await stageUploads([textFile("copy.txt")], { stagingRoot: root });
    const runId = await createRun();
    testRunIds.push(runId);
    const cleanupFailure = async () => {
      throw new Error("injected cleanup failure");
    };

    const claimed = await claimUploadSession(
      staged.uploadSession,
      [staged.uploads[0].id],
      runId,
      root,
      Date.now(),
      cleanupFailure
    );
    expect(claimed).toHaveLength(1);
    expect(new TextDecoder().decode(await readRunUpload(runId, claimed[0].id))).toBe(
      "Approved homepage copy"
    );
    await expect(
      claimUploadSession(staged.uploadSession, [staged.uploads[0].id], runId, root)
    ).rejects.toMatchObject({ status: 401 });
    expect((await readdir(sitePaths(runId).uploads)).filter((name) => name === "manifest.json")).toHaveLength(1);
  });

  it("routes bounded text by kind and leaves unsupported formats out of generation context", async () => {
    const root = await stagingRoot();
    const staged = await stageUploads([
      textFile("brand-guidelines.txt", "Use cobalt. api_key=super-secret-value-12345"),
      textFile("homepage-copy.txt", "Book an estimate today."),
      new File(["%PDF-safe"], "brand-guide.pdf", { type: "application/pdf" }),
    ], { stagingRoot: root });
    const runId = await createRun();
    testRunIds.push(runId);
    const claimed = await claimUploadSession(
      staged.uploadSession,
      staged.uploads.map((upload) => upload.id),
      runId,
      root
    );

    const context = await buildRunUploadContext(runId, claimed);
    expect(context.entries[0]).toMatchObject({
      kind: "brand-guidelines",
      status: "text-consumed",
      consumer: "design",
      content: expect.stringContaining("Use cobalt"),
    });
    expect(context.entries[1]).toMatchObject({
      kind: "copy-document",
      status: "text-consumed",
      consumer: "copy",
    });
    expect(context.entries[2]).toMatchObject({ status: "unsupported" });
    expect(context.designPromptText).toContain("Use cobalt");
    expect(context.designPromptText).toContain("[REDACTED]");
    expect(context.designPromptText).not.toContain("Book an estimate");
    expect(context.copyPromptText).toContain("Book an estimate");
    const modelContext = `${context.designPromptText}\n${context.copyPromptText}`;
    expect(modelContext).not.toContain("super-secret-value-12345");
    expect(modelContext).not.toContain("brand-guidelines.txt");
    expect(modelContext).not.toContain("homepage-copy.txt");
    expect(modelContext).not.toContain("uploads/");
    expect(modelContext).not.toContain(staged.uploadSession);
    for (const upload of claimed) {
      expect(modelContext).not.toContain(upload.id);
      expect(modelContext).not.toContain(upload.sha256!);
      expect(modelContext).not.toContain(upload.storagePath!);
    }
  });

  it("refuses a staged blob whose bytes no longer match the manifest", async () => {
    const root = await stagingRoot();
    const staged = await stageUploads([textFile("copy.txt")], {
      stagingRoot: root,
    });
    const digest = createHash("sha256")
      .update(staged.uploadSession)
      .digest("hex");
    const directory = path.join(root, digest);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8")
    ) as { files: Array<{ storedName: string }> };
    await writeFile(path.join(directory, manifest.files[0].storedName), "tampered");
    const runId = await createRun();
    testRunIds.push(runId);

    await expect(
      claimUploadSession(
        staged.uploadSession,
        [staged.uploads[0].id],
        runId,
        root
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a session whose authoritative manifest is missing", async () => {
    const root = await stagingRoot();
    const staged = await stageUploads([textFile("copy.txt")], {
      stagingRoot: root,
    });
    const digest = createHash("sha256")
      .update(staged.uploadSession)
      .digest("hex");
    await rm(path.join(root, digest, "manifest.json"));
    const runId = await createRun();
    testRunIds.push(runId);

    await expect(
      claimUploadSession(
        staged.uploadSession,
        [staged.uploads[0].id],
        runId,
        root
      )
    ).rejects.toMatchObject({ status: 401 });
  });
});
