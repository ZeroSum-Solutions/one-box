import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateApprovedVisualQaUnderSiteAuthority: vi.fn(),
}));

vi.mock("./runstate", () => ({
  invalidateApprovedVisualQaUnderSiteAuthority:
    mocks.invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError: class RunNotFoundError extends Error {},
  sitePaths: (runId: string) => ({
    root: `/tmp/onebox-site-mutation-locks/${runId}`,
  }),
}));

import { BlockingMutationError, runGuardedMutation } from "./siteMutation";

const tempDirectories: string[] = [];

afterEach(async () => {
  mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockReset();
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("committed site mutation visual-QA invalidation", () => {
  it("invalidates only after the candidate passes mechanical gates and commits", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-mutation-"));
    tempDirectories.push(directory);
    const target = path.join(directory, "index.html");
    await fs.writeFile(target, "before");
    const order: string[] = [];
    mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockImplementation(async () => {
      order.push("invalidate");
      return true;
    });

    await runGuardedMutation({
      runId: "test-run",
      snapshotPaths: [target],
      mutate: async () => {
        await fs.writeFile(target, "after");
        return "candidate";
      },
      gateRunner: async () => [],
      commit: async () => {
        order.push("commit");
      },
    });

    expect(order).toEqual(["commit", "invalidate"]);
    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).toHaveBeenCalledWith("test-run");
  });

  it("does not invalidate a rejected candidate", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-mutation-"));
    tempDirectories.push(directory);
    const target = path.join(directory, "index.html");
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId: "test-run",
        snapshotPaths: [target],
        mutate: async () => {
          await fs.writeFile(target, "rejected");
        },
        gateRunner: async () => [{
          gate: "axe",
          pass: false,
          blocking: true,
          details: ["blocked"],
          ranAt: "2026-08-13T12:00:00.000Z",
        }],
      })
    ).rejects.toBeInstanceOf(BlockingMutationError);

    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).not.toHaveBeenCalled();
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });
});
