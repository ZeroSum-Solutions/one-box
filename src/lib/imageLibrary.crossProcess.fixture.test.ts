import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateProjectImage, IMAGE_MODELS } from "./imageLibrary";

const sitesRoot = process.env.ONEBOX_CROSS_PROCESS_SITES_ROOT;
const runId = process.env.ONEBOX_CROSS_PROCESS_RUN_ID;
const requestId = process.env.ONEBOX_CROSS_PROCESS_REQUEST_ID;
const resultPath = process.env.ONEBOX_CROSS_PROCESS_RESULT_PATH;
const barrierDirectory = process.env.ONEBOX_CROSS_PROCESS_BARRIER_DIRECTORY;
const providerLog = process.env.ONEBOX_CROSS_PROCESS_PROVIDER_LOG;
const enabled = Boolean(
  sitesRoot &&
    runId &&
    requestId &&
    resultPath &&
    barrierDirectory &&
    providerLog,
);

describe.skipIf(!enabled)("cross-process image generation fixture", () => {
  it("records one terminal result for its immutable request id", async () => {
    await fs.mkdir(barrierDirectory!, { recursive: true });
    const result = await generateProjectImage(
      {
        runId: runId!,
        requestId: requestId!,
        prompt: `Cross-process request ${requestId}`,
        model: IMAGE_MODELS[0].id,
        aspectRatio: "1:1",
        quality: "high",
        meteredConsent: true,
      },
      {
        sitesRoot: sitesRoot!,
        estimate: async () => {
          await fs.writeFile(
            path.join(barrierDirectory!, requestId!),
            requestId!,
          );
          const deadline = Date.now() + 10_000;
          while ((await fs.readdir(barrierDirectory!)).length < 2) {
            if (Date.now() > deadline) throw new Error("peer process missed barrier");
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          return 8;
        },
        invalidateApproval: async () => false,
        generate: async ({ outPath }) => {
          await fs.appendFile(providerLog!, `${requestId}\n`);
          await new Promise((resolve) => setTimeout(resolve, 75));
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(
            outPath,
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              "base64",
            ),
          );
          return { path: outPath, url: "https://provider.example/result.png" };
        },
      },
    ).then(
      (generation) => ({ status: generation.item.status, credits: generation.item.credits }),
      (error: unknown) => ({
        status: "rejected",
        code:
          typeof error === "object" && error !== null && "status" in error
            ? (error as { status: unknown }).status
            : null,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    await fs.writeFile(resultPath!, JSON.stringify(result));
    expect(["completed", "rejected"]).toContain(result.status);
  });
});
