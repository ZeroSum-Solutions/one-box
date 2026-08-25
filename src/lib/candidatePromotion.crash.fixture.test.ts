import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { promoteCandidate, type PromotionFaultStep } from "./candidate";
import { sitePaths } from "./runstate";

const runId = process.env.ONEBOX_PROMOTION_CRASH_RUN_ID;
const faultStep = process.env.ONEBOX_PROMOTION_CRASH_STEP as
  | PromotionFaultStep
  | undefined;
const enabled = Boolean(runId && faultStep);

describe.skipIf(!enabled)("candidate promotion crash fixture", () => {
  it("terminates at the requested transaction boundary", async () => {
    await promoteCandidate(runId!, {
      injectFault: async (step) => {
        if (faultStep === "before-rollback" && step === "after-live-replaced") {
          throw new Error("enter rollback after live replacement");
        }
        // Vitest replaces process.exit with a catchable test failure. The
        // native exit primitive is required here so cleanup/finally blocks do
        // not run and the parent observes a real abrupt process boundary.
        if (step === faultStep) {
          const marker = path.join(sitePaths(runId!).root, ".promotion-crash-marker");
          const handle = await fs.open(marker, "wx");
          try {
            await handle.writeFile(`${step}:86`);
            await handle.sync();
          } finally {
            await handle.close();
          }
          (process as NodeJS.Process & { reallyExit(code: number): never })
            .reallyExit(86);
        }
      },
    });
    throw new Error(`promotion did not reach crash step: ${faultStep}`);
  });
});
