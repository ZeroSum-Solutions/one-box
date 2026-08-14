import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const runId = `route-test-${process.pid}`;
const runRoot = path.join(process.cwd(), "sites", runId);
const secret = "claimed-private-upload-bytes";

beforeEach(async () => {
  await fs.mkdir(path.join(runRoot, "research"), { recursive: true });
  await fs.mkdir(path.join(runRoot, "uploads"), { recursive: true });
  await fs.mkdir(path.join(runRoot, "site"), { recursive: true });
  await fs.mkdir(path.join(runRoot, "evidence", "versions", "design-contract"), { recursive: true });
  await fs.writeFile(path.join(runRoot, "evidence", "versions", "design-contract", "v1.DESIGN.md"), "approved preview");
  await fs.writeFile(
    path.join(runRoot, "research", "public.md"),
    "public research",
  );
  await fs.writeFile(path.join(runRoot, "uploads", "claimed.bin"), secret);
  await fs.writeFile(
    path.join(runRoot, "intake.json"),
    JSON.stringify({
      businessName: "Fixture",
      uploads: [
        {
          id: "upload-1",
          fileName: "private.pdf",
          storagePath: "uploads/claimed.bin",
          sha256: "secret-hash",
        },
      ],
    }),
  );
});

afterEach(async () => {
  await fs.rm(runRoot, { recursive: true, force: true });
});

function request(parts: string[]) {
  return GET(
    new Request(`http://local/api/sites/${runId}/${parts.join("/")}`),
    {
      params: Promise.resolve({ id: runId, path: parts }),
    },
  );
}

describe("public site artifact boundary", () => {
  it("serves research only from the research root", async () => {
    const response = await request(["research", "public.md"]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("public research");
  });

  it("serves bounded versioned evidence for workspace previews", async () => {
    const response = await request(["evidence", "versions", "design-contract", "v1.DESIGN.md"]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("approved preview");
  });

  it.each([
    ["research", "..", "uploads", "claimed.bin"],
    ["research", "%2e%2e", "uploads", "claimed.bin"],
    ["research", "%252e%252e", "uploads", "claimed.bin"],
    ["research", "..%2fuploads%2fclaimed.bin"],
    ["research", ""],
  ])(
    "refuses traversal segments without serving claimed upload bytes: %j",
    async (...parts) => {
      const response = await request(parts);
      expect(response.status).not.toBe(200);
      expect(await response.text()).not.toContain(secret);
    },
  );

  it("does not publish uploads through the site root", async () => {
    const response = await request(["uploads", "claimed.bin"]);
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain(secret);
  });

  it("does not follow a research symlink to a claimed upload", async () => {
    await fs.symlink(
      path.join(runRoot, "uploads", "claimed.bin"),
      path.join(runRoot, "research", "leak.bin"),
    );
    const response = await request(["research", "leak.bin"]);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(secret);
  });

  it("redacts all private upload metadata from public intake", async () => {
    const response = await request(["intake.json"]);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("storagePath");
    expect(body).not.toContain("uploads/claimed.bin");
    expect(body).not.toContain("secret-hash");
    expect(body).not.toContain("private.pdf");
    expect(body).not.toContain("upload-1");
    expect(JSON.parse(body).uploads).toEqual([]);
  });
});
