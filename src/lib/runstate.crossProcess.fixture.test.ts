import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { withRunTransaction } from "./runstate";

const runId = process.env.ONEBOX_CROSS_PROCESS_RUN_ID;
const writerId = process.env.ONEBOX_CROSS_PROCESS_WRITER_ID;
const barrierDirectory = process.env.ONEBOX_CROSS_PROCESS_BARRIER_DIRECTORY;
const enabled = Boolean(runId && writerId && barrierDirectory);

describe.skipIf(!enabled)("cross-process run-state fixture", () => {
  it("applies one delayed read-modify-write transaction", async () => {
    await fs.mkdir(barrierDirectory!, { recursive: true });
    await fs.writeFile(path.join(barrierDirectory!, writerId!), writerId!);
    const deadline = Date.now() + 10_000;
    while ((await fs.readdir(barrierDirectory!)).length < 2) {
      if (Date.now() > deadline) throw new Error("peer process missed barrier");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await withRunTransaction(runId!, async (transaction) => {
      transaction.state.costUsd += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
