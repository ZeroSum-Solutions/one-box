import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true }),
  ));
});

describe("site authority", () => {
  it("serializes critical sections from separate processes without deadlock", async () => {
    const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-site-authority-"));
    roots.push(runRoot);
    const barrier = path.join(runRoot, "barrier");
    const fixture = path.join(process.cwd(), "src/lib/siteAuthority.crossProcess.fixture.test.ts");
    const vitest = path.join(process.cwd(), "node_modules/vitest/vitest.mjs");

    await Promise.all(["writer-a", "writer-b"].map((writerId) =>
      execFileAsync(process.execPath, [vitest, "run", fixture, "--maxWorkers=1"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ONEBOX_SITE_AUTHORITY_RUN_ID: "cross-process-site",
          ONEBOX_SITE_AUTHORITY_RUN_ROOT: runRoot,
          ONEBOX_SITE_AUTHORITY_WRITER_ID: writerId,
          ONEBOX_SITE_AUTHORITY_BARRIER: barrier,
        },
      }),
    ));

    const lines = (await fs.readFile(path.join(runRoot, "site-authority-order.log"), "utf8"))
      .trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0].split(":")[0]).toBe(lines[1].split(":")[0]);
    expect(lines[0]).toMatch(/:start$/);
    expect(lines[1]).toMatch(/:end$/);
    expect(lines[2].split(":")[0]).toBe(lines[3].split(":")[0]);
    expect(lines[2]).toMatch(/:start$/);
    expect(lines[3]).toMatch(/:end$/);
  }, 20_000);
});
