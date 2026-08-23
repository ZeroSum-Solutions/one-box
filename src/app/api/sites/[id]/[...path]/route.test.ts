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
  await fs.mkdir(path.join(runRoot, "candidate", "site"), { recursive: true });
  await fs.mkdir(path.join(runRoot, "evidence", "versions", "design-contract"), { recursive: true });
  await fs.writeFile(path.join(runRoot, "evidence", "versions", "design-contract", "v1.DESIGN.md"), "approved preview");
  await fs.writeFile(
    path.join(runRoot, "research", "public.md"),
    "public research",
  );
  await fs.writeFile(path.join(runRoot, "uploads", "claimed.bin"), secret);
  await fs.writeFile(
    path.join(runRoot, "candidate", "site", "candidate-secret.html"),
    "candidate-private-bytes",
  );
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

  it("does not serve canonical live-bundle authority metadata", async () => {
    await fs.writeFile(
      path.join(runRoot, "site", "manifest.json"),
      JSON.stringify({
        entry: "index.html",
        files: ["index.html"],
        assets: [],
        builtAt: "2026-08-22T00:00:00.000Z",
        complete: true,
      }),
    );
    await fs.mkdir(path.join(runRoot, "site", ".one-box"));
    await fs.writeFile(
      path.join(runRoot, "site", ".one-box", "provenance.json"),
      "canonical-private-authority",
    );

    const response = await request([".one-box", "provenance.json"]);

    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain("canonical-private-authority");
  });

  it("does not serve candidate bytes through a candidate-shaped site URL or symlink", async () => {
    await fs.writeFile(
      path.join(runRoot, "site", "manifest.json"),
      JSON.stringify({
        entry: "index.html",
        files: ["index.html"],
        assets: [],
        builtAt: "2026-08-22T00:00:00.000Z",
        complete: true,
      }),
    );
    await fs.writeFile(path.join(runRoot, "site", "index.html"), "live");

    const direct = await request([
      "candidate",
      "site",
      "candidate-secret.html",
    ]);
    expect(direct.status).not.toBe(200);
    expect(await direct.text()).not.toContain("candidate-private-bytes");

    await fs.symlink("../candidate", path.join(runRoot, "site", "candidate"));
    const symlinked = await request([
      "candidate",
      "site",
      "candidate-secret.html",
    ]);
    expect(symlinked.status).toBe(403);
    expect(await symlinked.text()).not.toContain("candidate-private-bytes");
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
