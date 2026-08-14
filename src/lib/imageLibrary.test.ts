import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  IMAGE_GENERATION_STALE_MS,
  IMAGE_MODELS,
  assetPublicUrl,
  generateProjectImage,
  listProjectImages,
  placeLibraryImage,
  reclaimObservedGenerationClaim,
} from "./imageLibrary";
import { readImageGenerationLedger } from "./imageGenerationBudget";
import { RunNotFoundError } from "./runstate";
import { withSiteAuthorityLock } from "./siteMutation";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const sitesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-images-"));
  roots.push(sitesRoot);
  const runId = "image-test";
  const site = path.join(sitesRoot, runId, "site");
  await fs.mkdir(path.join(site, "assets"), { recursive: true });
  await fs.writeFile(path.join(site, "assets", "hero.jpg"), Buffer.from([255, 216, 255, 217]));
  await fs.writeFile(
    path.join(site, "index.html"),
    '<!doctype html><main data-edit-id="hero.region"><img data-edit-id="hero.image" src="assets/hero.jpg" alt="Hero"></main>',
  );
  await fs.writeFile(
    path.join(site, "manifest.json"),
    JSON.stringify({
      entry: "index.html",
      files: ["index.html", "assets/hero.jpg"],
      assets: [{ path: "assets/hero.jpg", kind: "image" }],
      builtAt: "2026-08-14T00:00:00.000Z",
      complete: true,
    }),
  );
  return { sitesRoot, runId, site };
}

describe("project image library", () => {
  it("does not let a stale second waiter delete a replacement generation claim", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-claim-aba-"));
    roots.push(root);
    const lockPath = path.join(root, "request.lock");
    const ownerDirectory = `${lockPath}.owners`;
    const staleOwner = "stale-owner";
    await fs.mkdir(lockPath, { recursive: true });
    await fs.mkdir(ownerDirectory, { recursive: true });
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      JSON.stringify({ token: staleOwner }),
    );
    await fs.writeFile(path.join(ownerDirectory, `${staleOwner}.owner`), "");

    let releaseSecondWaiter!: () => void;
    const secondWaiterMayContinue = new Promise<void>((resolve) => {
      releaseSecondWaiter = resolve;
    });
    let secondWaiterObserved!: () => void;
    const secondWaiterIsPaused = new Promise<void>((resolve) => {
      secondWaiterObserved = resolve;
    });
    const secondWaiter = reclaimObservedGenerationClaim(
      lockPath,
      staleOwner,
      "waiter-b",
      {
        beforeAuthorize: async () => {
          secondWaiterObserved();
          await secondWaiterMayContinue;
        },
      },
    );
    await secondWaiterIsPaused;

    expect(
      await reclaimObservedGenerationClaim(
        lockPath,
        staleOwner,
        "waiter-a",
      ),
    ).toBe(true);
    const replacementOwner = "replacement-owner";
    await fs.mkdir(lockPath);
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      JSON.stringify({ token: replacementOwner }),
    );
    await fs.writeFile(
      path.join(ownerDirectory, `${replacementOwner}.owner`),
      "",
    );

    releaseSecondWaiter();
    expect(await secondWaiter).toBe(false);
    expect(
      JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8")),
    ).toMatchObject({ token: replacementOwner });
  });

  it("backfills legacy site images with stable provenance and derived usage", async () => {
    const { sitesRoot, runId } = await fixture();
    const first = await listProjectImages(runId, sitesRoot);
    const second = await listProjectImages(runId, sitesRoot);

    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      id: expect.stringMatching(/^legacy_[0-9a-f]{20}$/),
      status: "completed",
      prompt: null,
      model: "unknown",
      provider: "unknown",
      outputPath: "site/assets/hero.jpg",
      source: { kind: "legacy", originalPath: "assets/hero.jpg" },
      usage: [{ editId: "hero.image", src: "assets/hero.jpg" }],
    });
    expect(second.items[0].id).toBe(first.items[0].id);
    expect(assetPublicUrl(runId, first.items[0])).toBe(
      "/api/sites/image-test/assets/hero.jpg",
    );
  });

  it("persists pending before the unlocked provider call, then durable output metadata", async () => {
    const { sitesRoot, runId } = await fixture();
    let providerSawPending = false;
    let providerCouldAcquireSiteLock = false;
    let approvalInvalidations = 0;
    const result = await generateProjectImage(
      {
        runId,
        requestId: "00000000-0000-4000-8000-000000000123",
        prompt: "A clean fiber optic installation at sunrise",
        model: IMAGE_MODELS[0].id,
        aspectRatio: "16:9",
        quality: "high",
        meteredConsent: true,
        targetEditId: "hero.image",
      },
      {
        sitesRoot,
        now: () => new Date("2026-08-14T12:00:00.000Z"),
        estimate: async () => 2,
        invalidateApproval: async () => {
          approvalInvalidations += 1;
          return true;
        },
        generate: async (options) => {
          const catalog = JSON.parse(
            await fs.readFile(
              path.join(sitesRoot, runId, "image-library.json"),
              "utf8",
            ),
          ) as { items: Array<{ status: string }> };
          providerSawPending = catalog.items[0]?.status === "pending";
          await withSiteAuthorityLock(runId, async () => {
            providerCouldAcquireSiteLock = true;
          });
          await fs.mkdir(path.dirname(options.outPath), { recursive: true });
          await fs.writeFile(
            options.outPath,
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              "base64",
            ),
          );
          return { path: options.outPath, url: "https://provider.example/result.png" };
        },
      },
    );

    expect(providerSawPending).toBe(true);
    expect(providerCouldAcquireSiteLock).toBe(true);
    expect(result.item).toMatchObject({
      status: "completed",
      prompt: "A clean fiber optic installation at sunrise",
      model: "higgsfield:gpt_image_2",
      provider: "higgsfield",
      aspectRatio: "16:9",
      quality: "high",
      dimensions: { width: 1, height: 1 },
      mimeType: "image/png",
      credits: 2,
      outputPath:
        "site/assets/generated/00000000-0000-4000-8000-000000000123.png",
      source: { kind: "generated", targetEditId: "hero.image" },
      approvalInvalidatedAt: expect.any(String),
    });
    expect(approvalInvalidations).toBe(1);
  });

  it("keeps failed generations visible with prompt, credits, error, and lineage", async () => {
    const { sitesRoot, runId } = await fixture();
    const legacy = (await listProjectImages(runId, sitesRoot)).items[0];
    const result = await generateProjectImage(
      {
        runId,
        requestId: "00000000-0000-4000-8000-000000000124",
        prompt: "Regenerate the current hero in evening light",
        model: IMAGE_MODELS[0].id,
        aspectRatio: "4:3",
        quality: "medium",
        meteredConsent: true,
        sourceAssetId: legacy.id,
      },
      {
        sitesRoot,
        estimate: async () => 3,
        generate: async () => ({ error: "provider queue timed out" }),
      },
    );

    expect(result.item).toMatchObject({
      status: "failed",
      prompt: "Regenerate the current hero in evening light",
      credits: 3,
      error: "provider queue timed out",
      outputPath: null,
      source: { parentAssetId: legacy.id },
    });
  });

  it("rejects missing metered consent before estimate, reservation, or provider work", async () => {
    const { sitesRoot, runId } = await fixture();
    let estimated = false;
    let generated = false;

    await expect(
      generateProjectImage(
        {
          runId,
          requestId: "00000000-0000-4000-8000-000000000125",
          prompt: "A clean fiber optic installation",
          model: IMAGE_MODELS[0].id,
          aspectRatio: "1:1",
          quality: "high",
          meteredConsent: false as unknown as true,
        },
        {
          sitesRoot,
          estimate: async () => {
            estimated = true;
            return 1;
          },
          generate: async () => {
            generated = true;
            return { error: "should not run" };
          },
        },
      ),
    ).rejects.toMatchObject({
      message: "explicit metered consent is required",
      status: 400,
    });

    expect(estimated).toBe(false);
    expect(generated).toBe(false);
    await expect(
      fs.readFile(
        path.join(sitesRoot, runId, "image-generation-ledger.json"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replays one immutable request without a second reservation or provider call", async () => {
    const { sitesRoot, runId } = await fixture();
    const request = {
      runId,
      requestId: "00000000-0000-4000-8000-000000000131",
      prompt: "A single replay-safe fiber image",
      model: IMAGE_MODELS[0].id,
      aspectRatio: "1:1" as const,
      quality: "high" as const,
      meteredConsent: true as const,
    };
    let providerCalls = 0;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    let releaseProvider!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const dependencies = {
      sitesRoot,
      estimate: async () => 1,
      invalidateApproval: async () => false,
      generate: async (options: { outPath: string }) => {
        providerCalls += 1;
        providerStarted();
        await release;
        await fs.mkdir(path.dirname(options.outPath), { recursive: true });
        await fs.writeFile(
          options.outPath,
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        );
        return { path: options.outPath, url: "https://provider.example/result.png" };
      },
    };

    const first = generateProjectImage(request, dependencies);
    await started;
    const pendingReplay = await generateProjectImage(request, dependencies);
    expect(pendingReplay.item.status).toBe("pending");
    expect(providerCalls).toBe(1);

    releaseProvider();
    const completed = await first;
    expect(completed.item.status).toBe("completed");
    const completedReplay = await generateProjectImage(request, dependencies);
    expect(completedReplay.item).toEqual(completed.item);
    expect(providerCalls).toBe(1);

    await expect(
      generateProjectImage(
        { ...request, prompt: "A different payload under the same UUID" },
        dependencies,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/request.*different/i),
      status: 409,
    });
    const ledger = await readImageGenerationLedger(
      path.join(sitesRoot, runId, "image-generation-ledger.json"),
    );
    expect(ledger.entries.filter((entry) => entry.requestId === request.requestId)).toHaveLength(1);
  });

  it("serializes different request ids at the per-run credit-cap transaction", async () => {
    const { sitesRoot, runId } = await fixture();
    let providerCalls = 0;
    let firstProviderStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstProviderStarted = resolve;
    });
    let releaseFirstProvider!: () => void;
    const releaseFirst = new Promise<void>((resolve) => {
      releaseFirstProvider = resolve;
    });
    const dependencies = {
      sitesRoot,
      estimate: async () => 8,
      invalidateApproval: async () => false,
      generate: async (options: { outPath: string }) => {
        providerCalls += 1;
        firstProviderStarted();
        await releaseFirst;
        await fs.mkdir(path.dirname(options.outPath), { recursive: true });
        await fs.writeFile(
          options.outPath,
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        );
        return { path: options.outPath, url: "https://provider.example/result.png" };
      },
    };
    const request = (requestId: string, prompt: string) => ({
      runId,
      requestId,
      prompt,
      model: IMAGE_MODELS[0].id,
      aspectRatio: "1:1" as const,
      quality: "high" as const,
      meteredConsent: true as const,
    });

    const first = generateProjectImage(
      request(
        "00000000-0000-4000-8000-000000000136",
        "First eight-credit image",
      ),
      dependencies,
    );
    await firstStarted;
    await expect(
      generateProjectImage(
        request(
          "00000000-0000-4000-8000-000000000137",
          "Second eight-credit image",
        ),
        dependencies,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/credit cap reached/i),
      status: 429,
    });
    expect(providerCalls).toBe(1);

    releaseFirstProvider();
    await expect(first).resolves.toMatchObject({
      item: { status: "completed", credits: 8 },
    });
    const ledger = await readImageGenerationLedger(
      path.join(sitesRoot, runId, "image-generation-ledger.json"),
    );
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].credits).toBe(8);
  });

  it("enforces the credit cap across processes with different request ids", async () => {
    const { sitesRoot, runId } = await fixture();
    const barrierDirectory = path.join(sitesRoot, "cross-process-barrier");
    const providerLog = path.join(sitesRoot, "provider-calls.log");
    const requestIds = [
      "00000000-0000-4000-8000-000000000138",
      "00000000-0000-4000-8000-000000000139",
    ];
    const resultPaths = requestIds.map((requestId) =>
      path.join(sitesRoot, `${requestId}.json`),
    );
    const vitestEntry = path.join(
      process.cwd(),
      "node_modules/vitest/vitest.mjs",
    );
    const fixturePath = path.join(
      process.cwd(),
      "src/lib/imageLibrary.crossProcess.fixture.test.ts",
    );

    await Promise.all(
      requestIds.map((requestId, index) =>
        execFileAsync(
          process.execPath,
          [vitestEntry, "run", fixturePath, "--maxWorkers=1"],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              ONEBOX_CROSS_PROCESS_SITES_ROOT: sitesRoot,
              ONEBOX_CROSS_PROCESS_RUN_ID: runId,
              ONEBOX_CROSS_PROCESS_REQUEST_ID: requestId,
              ONEBOX_CROSS_PROCESS_RESULT_PATH: resultPaths[index],
              ONEBOX_CROSS_PROCESS_BARRIER_DIRECTORY: barrierDirectory,
              ONEBOX_CROSS_PROCESS_PROVIDER_LOG: providerLog,
            },
          },
        ),
      ),
    );

    const results = await Promise.all(
      resultPaths.map(async (resultPath) =>
        JSON.parse(await fs.readFile(resultPath, "utf8")) as {
          status: string;
          credits?: number;
          code?: number;
          message?: string;
        },
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      "completed",
      "rejected",
    ]);
    expect(results.find((result) => result.status === "completed")).toMatchObject({
      credits: 8,
    });
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      code: 429,
      message: expect.stringMatching(/credit cap reached/i),
    });
    expect((await fs.readFile(providerLog, "utf8")).trim().split("\n")).toHaveLength(1);

    const ledger = await readImageGenerationLedger(
      path.join(sitesRoot, runId, "image-generation-ledger.json"),
    );
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].credits).toBe(8);
  }, 20_000);

  it("retries approval invalidation after run state is restored", async () => {
    const { sitesRoot, runId } = await fixture();
    const request = {
      runId,
      requestId: "00000000-0000-4000-8000-000000000132",
      prompt: "An image completed before run state appeared",
      model: IMAGE_MODELS[0].id,
      aspectRatio: "1:1" as const,
      quality: "high" as const,
      meteredConsent: true as const,
    };
    let providerCalls = 0;
    const baseDependencies = {
      sitesRoot,
      estimate: async () => 1,
      generate: async (options: { outPath: string }) => {
        providerCalls += 1;
        await fs.mkdir(path.dirname(options.outPath), { recursive: true });
        await fs.writeFile(
          options.outPath,
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        );
        return { path: options.outPath, url: "https://provider.example/result.png" };
      },
    };
    const unavailable = await generateProjectImage(request, {
      ...baseDependencies,
      invalidateApproval: async () => {
        throw new RunNotFoundError(runId);
      },
    });
    expect(unavailable.item.approvalInvalidatedAt).toBeNull();

    let restoredInvalidations = 0;
    const replayed = await generateProjectImage(request, {
      ...baseDependencies,
      invalidateApproval: async () => {
        restoredInvalidations += 1;
        return false;
      },
    });
    expect(replayed.item.approvalInvalidatedAt).toEqual(expect.any(String));
    expect(restoredInvalidations).toBe(1);
    expect(providerCalls).toBe(1);
  });

  it("fails only stale pending generations and reconciles their reservations once", async () => {
    const { sitesRoot, runId } = await fixture();
    const root = path.join(sitesRoot, runId);
    const catalogPath = path.join(root, "image-library.json");
    const ledgerPath = path.join(root, "image-generation-ledger.json");
    const library = await listProjectImages(runId, sitesRoot);
    const now = Date.now();
    const oldTimestamp = new Date(
      now - IMAGE_GENERATION_STALE_MS - 1_000,
    ).toISOString();
    const freshTimestamp = new Date(now).toISOString();
    const oldId = "00000000-0000-4000-8000-000000000126";
    const freshId = "00000000-0000-4000-8000-000000000127";
    const pendingItem = (id: string, timestamp: string) => ({
      id,
      status: "pending",
      prompt: "A generated image interrupted during processing",
      model: IMAGE_MODELS[0].id,
      provider: "higgsfield",
      aspectRatio: "1:1",
      quality: "high",
      dimensions: null,
      mimeType: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      credits: 1,
      error: null,
      outputPath: null,
      source: {
        kind: "generated",
        parentAssetId: null,
        targetEditId: null,
        originalPath: null,
      },
      usage: [],
    });
    await fs.writeFile(
      catalogPath,
      JSON.stringify({
        version: 1,
        items: [
          pendingItem(oldId, oldTimestamp),
          pendingItem(freshId, freshTimestamp),
          ...library.items,
        ],
      }),
    );
    await fs.writeFile(
      ledgerPath,
      JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [oldId, freshId].map((requestId) => ({
          requestId,
          editId: "image-library",
          instructionSha256: "a".repeat(64),
          model: "gpt_image_2",
          credits: 1,
          status: "reserved",
          reservedAt: requestId === oldId ? oldTimestamp : freshTimestamp,
        })),
      }),
    );

    const reconciled = await listProjectImages(runId, sitesRoot);
    expect(reconciled.items.find((item) => item.id === oldId)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/interrupted.*retry/i),
    });
    expect(reconciled.items.find((item) => item.id === freshId)).toMatchObject({
      status: "pending",
      error: null,
    });
    const firstLedger = await readImageGenerationLedger(ledgerPath);
    expect(firstLedger.entries.find((entry) => entry.requestId === oldId)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/interrupted.*retry/i),
      finishedAt: expect.any(String),
    });
    const freshLedgerEntry = firstLedger.entries.find(
      (entry) => entry.requestId === freshId,
    );
    expect(freshLedgerEntry).toMatchObject({ status: "reserved" });
    expect(freshLedgerEntry).not.toHaveProperty("finishedAt");

    await listProjectImages(runId, sitesRoot);
    const secondLedger = await readImageGenerationLedger(ledgerPath);
    expect(
      secondLedger.entries.find((entry) => entry.requestId === oldId)?.finishedAt,
    ).toBe(
      firstLedger.entries.find((entry) => entry.requestId === oldId)?.finishedAt,
    );
  });

  it("checks exact catalog capacity before reserving generation credits", async () => {
    const { sitesRoot, runId } = await fixture();
    const root = path.join(sitesRoot, runId);
    const timestamp = new Date().toISOString();
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `legacy_capacity_${String(index).padStart(3, "0")}`,
      status: "completed",
      prompt: null,
      model: "unknown",
      provider: "unknown",
      aspectRatio: null,
      quality: null,
      dimensions: null,
      mimeType: index === 0 ? "image/jpeg" : null,
      createdAt: timestamp,
      updatedAt: timestamp,
      credits: null,
      error: null,
      outputPath: index === 0 ? "site/assets/hero.jpg" : null,
      source: {
        kind: "legacy",
        parentAssetId: null,
        targetEditId: index === 0 ? "hero.image" : null,
        originalPath: index === 0 ? "assets/hero.jpg" : null,
      },
      usage:
        index === 0
          ? [{ editId: "hero.image", src: "assets/hero.jpg" }]
          : [],
    }));
    await fs.writeFile(
      path.join(root, "image-library.json"),
      JSON.stringify({ version: 1, items }),
    );
    let providerCalled = false;

    await expect(
      generateProjectImage(
        {
          runId,
          requestId: "00000000-0000-4000-8000-000000000128",
          prompt: "A new image beyond the catalog limit",
          model: IMAGE_MODELS[0].id,
          aspectRatio: "1:1",
          quality: "high",
          meteredConsent: true,
        },
        {
          sitesRoot,
          estimate: async () => 1,
          generate: async () => {
            providerCalled = true;
            return { error: "should not run" };
          },
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/catalog.*500/i),
      status: 409,
    });
    expect(providerCalled).toBe(false);
    await expect(
      fs.readFile(path.join(root, "image-generation-ledger.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers completed deterministic output and closes orphan reservations", async () => {
    const { sitesRoot, runId, site } = await fixture();
    const root = path.join(sitesRoot, runId);
    const catalogPath = path.join(root, "image-library.json");
    const ledgerPath = path.join(root, "image-generation-ledger.json");
    const library = await listProjectImages(runId, sitesRoot);
    const completedId = "00000000-0000-4000-8000-000000000129";
    const orphanId = "00000000-0000-4000-8000-000000000130";
    const timestamp = new Date().toISOString();
    await fs.writeFile(
      catalogPath,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: completedId,
            status: "pending",
            prompt: "A provider output that completed before a crash",
            model: IMAGE_MODELS[0].id,
            provider: "higgsfield",
            aspectRatio: "1:1",
            quality: "high",
            dimensions: null,
            mimeType: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            credits: 1,
            error: null,
            outputPath: null,
            source: {
              kind: "generated",
              parentAssetId: null,
              targetEditId: null,
              originalPath: null,
            },
            usage: [],
          },
          ...library.items,
        ],
      }),
    );
    await fs.writeFile(
      ledgerPath,
      JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [completedId, orphanId].map((requestId) => ({
          requestId,
          editId: "image-library",
          instructionSha256: "b".repeat(64),
          model: "gpt_image_2",
          credits: 1,
          status: "reserved",
          reservedAt: timestamp,
        })),
      }),
    );
    const outputDirectory = path.join(site, "assets", "generated");
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(
      path.join(outputDirectory, `${completedId}.png`),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const recovered = await listProjectImages(runId, sitesRoot);
    expect(recovered.items.find((item) => item.id === completedId)).toMatchObject({
      status: "completed",
      mimeType: "image/png",
      dimensions: { width: 1, height: 1 },
      outputPath: `site/assets/generated/${completedId}.png`,
    });
    const ledger = await readImageGenerationLedger(ledgerPath);
    expect(ledger.entries.find((entry) => entry.requestId === completedId)).toMatchObject({
      status: "completed",
      finishedAt: expect.any(String),
    });
    expect(ledger.entries.find((entry) => entry.requestId === orphanId)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/interrupted.*catalog/i),
      finishedAt: expect.any(String),
    });
  });

  it("replays a crashed pre-catalog reservation instead of rerunning its provider", async () => {
    const { sitesRoot, runId } = await fixture();
    const root = path.join(sitesRoot, runId);
    await listProjectImages(runId, sitesRoot);
    const requestId = "00000000-0000-4000-8000-000000000135";
    const prompt = "A request interrupted before catalog persistence";
    const oldTimestamp = new Date(
      Date.now() - IMAGE_GENERATION_STALE_MS - 1_000,
    );
    await fs.writeFile(
      path.join(root, "image-generation-ledger.json"),
      JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [
          {
            requestId,
            editId: "image-library",
            instructionSha256: "c".repeat(64),
            model: "gpt_image_2",
            credits: 1,
            status: "reserved",
            reservedAt: oldTimestamp.toISOString(),
          },
        ],
      }),
    );
    const claimPath = path.join(
      root,
      "image-generation-claims",
      `${requestId}.lock`,
    );
    await fs.mkdir(claimPath, { recursive: true });
    await fs.mkdir(`${claimPath}.owners`, { recursive: true });
    await fs.writeFile(
      path.join(`${claimPath}.owners`, "crashed-owner.owner"),
      "crashed-owner",
    );
    await fs.writeFile(
      path.join(claimPath, "owner.json"),
      JSON.stringify({
        token: "crashed-owner",
        createdAt: oldTimestamp.toISOString(),
        request: {
          prompt,
          model: IMAGE_MODELS[0].id,
          aspectRatio: "1:1",
          quality: "high",
          sourceAssetId: null,
          targetEditId: null,
        },
      }),
    );
    await fs.utimes(claimPath, oldTimestamp, oldTimestamp);
    let providerCalled = false;

    const replayed = await generateProjectImage(
      {
        runId,
        requestId,
        prompt,
        model: IMAGE_MODELS[0].id,
        aspectRatio: "1:1",
        quality: "high",
        meteredConsent: true,
      },
      {
        sitesRoot,
        estimate: async () => 1,
        generate: async () => {
          providerCalled = true;
          return { error: "should not run" };
        },
      },
    );
    expect(replayed.item).toMatchObject({
      id: requestId,
      status: "failed",
      error: expect.stringMatching(/interrupted.*catalog/i),
    });
    expect(providerCalled).toBe(false);
    expect(
      (await readImageGenerationLedger(
        path.join(root, "image-generation-ledger.json"),
      )).entries[0].status,
    ).toBe("failed");
  });

  it("places a completed library image through guarded site mutation", async () => {
    const { sitesRoot, runId, site } = await fixture();
    await fs.writeFile(
      path.join(site, "assets", "alternate.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const manifest = JSON.parse(
      await fs.readFile(path.join(site, "manifest.json"), "utf8"),
    ) as { assets: Array<{ path: string; kind: string }> };
    manifest.assets.push({ path: "assets/alternate.png", kind: "image" });
    await fs.writeFile(path.join(site, "manifest.json"), JSON.stringify(manifest));
    const alternate = (await listProjectImages(runId, sitesRoot)).items.find(
      (item) => item.outputPath === "site/assets/alternate.png",
    )!;
    const placed = await placeLibraryImage(runId, alternate.id, "hero.image", {
      sitesRoot,
      gateRunner: async () => [
        {
          gate: "fixture",
          pass: true,
          blocking: true,
          details: [],
          ranAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });
    expect(placed.item.usage).toEqual([
      { editId: "hero.image", src: "assets/alternate.png" },
    ]);
    expect(await fs.readFile(path.join(site, "index.html"), "utf8")).toContain(
      'src="assets/alternate.png"',
    );
  });
});
