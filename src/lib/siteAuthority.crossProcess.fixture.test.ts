import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { withSiteAuthorityLock } from "./siteAuthority";

const runId = process.env.ONEBOX_SITE_AUTHORITY_RUN_ID;
const runRoot = process.env.ONEBOX_SITE_AUTHORITY_RUN_ROOT;
const writerId = process.env.ONEBOX_SITE_AUTHORITY_WRITER_ID;
const barrier = process.env.ONEBOX_SITE_AUTHORITY_BARRIER;
const enabled = Boolean(runId && runRoot && writerId && barrier);

describe.skipIf(!enabled)("cross-process site authority fixture", () => {
  it("writes one non-interleaved critical section", async () => {
    await fs.mkdir(barrier!, { recursive: true });
    await fs.writeFile(path.join(barrier!, writerId!), writerId!);
    const deadline = Date.now() + 10_000;
    while ((await fs.readdir(barrier!)).length < 2) {
      if (Date.now() > deadline) throw new Error("peer process missed barrier");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await withSiteAuthorityLock(runId!, async () => {
      const log = path.join(runRoot!, "site-authority-order.log");
      await fs.appendFile(log, `${writerId}:start\n`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.appendFile(log, `${writerId}:end\n`);
    }, { runRoot });
  });
});
