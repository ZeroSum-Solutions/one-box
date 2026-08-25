import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readOptionalBoundedAuthorityFile } from "./authorityFile";
import { createRun, sitePaths } from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";

describe("bounded site-authority file reads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a regular file replaced by a symlink between lstat and open", async () => {
    const runId = `authority-read-race-${process.pid}`;
    await createRun({ id: runId, pipelineVersion: "legacy-v1" });
    const root = sitePaths(runId).root;
    const target = path.join(root, "page-ir-edit-history.json");
    const external = path.join(root, "external.json");
    await fs.writeFile(target, "trusted-before");
    await fs.writeFile(external, "external-must-not-be-read");
    const originalOpen = fs.open.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      if (!replaced && path.resolve(String(filePath)) === path.resolve(target)) {
        replaced = true;
        await fs.rm(target);
        await fs.symlink(external, target);
      }
      return originalOpen(filePath, flags, mode);
    });

    try {
      await expect(withSiteAuthorityLock(runId, () =>
        readOptionalBoundedAuthorityFile(target, 1024, "Page IR transaction input")
      )).rejects.toThrow(/changed before read/i);
      expect(await fs.readFile(external, "utf8")).toBe("external-must-not-be-read");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not delegate bounded authority reads to an unbounded readFile call", async () => {
    const runId = `authority-read-bounded-${process.pid}`;
    await createRun({ id: runId, pipelineVersion: "legacy-v1" });
    const root = sitePaths(runId).root;
    const target = path.join(root, "page-ir-edit-history.json");
    await fs.writeFile(target, "trusted-input");
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      const handle = await originalOpen(filePath, flags, mode);
      return Object.assign(handle, {
        readFile: vi.fn(async () => {
          throw new Error("unbounded readFile must not be used");
        }),
      });
    });

    try {
      await expect(withSiteAuthorityLock(runId, () =>
        readOptionalBoundedAuthorityFile(target, 1024, "Page IR transaction input")
      )).resolves.toEqual(Buffer.from("trusted-input"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
