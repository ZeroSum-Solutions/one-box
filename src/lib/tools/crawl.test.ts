import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, resolveCrawl4aiScriptPath } from "./crawl";

const originalCrawl4aiScriptPath = process.env.CRAWL4AI_SCRIPT_PATH;
const originalFirecrawlApiKey = process.env.FIRECRAWL_API_KEY;
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  if (originalCrawl4aiScriptPath === undefined) {
    delete process.env.CRAWL4AI_SCRIPT_PATH;
  } else {
    process.env.CRAWL4AI_SCRIPT_PATH = originalCrawl4aiScriptPath;
  }
  if (originalFirecrawlApiKey === undefined) {
    delete process.env.FIRECRAWL_API_KEY;
  } else {
    process.env.FIRECRAWL_API_KEY = originalFirecrawlApiKey;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("resolveCrawl4aiScriptPath", () => {
  it("uses the portable home-relative default", () => {
    delete process.env.CRAWL4AI_SCRIPT_PATH;

    expect(resolveCrawl4aiScriptPath()).toBe(
      path.join(
        os.homedir(),
        "projects/tools/zs-skills/skills/research/deep-dive/scripts/crawl4ai-scrape.sh"
      )
    );
  });
});

describe("crawlSite", () => {
  it("honors the script override and keeps a crawl4ai success off the network", async () => {
    const tempDir = await makeTempDir("one-box-crawl-success-");
    const scriptPath = path.join(tempDir, "crawl-success.sh");
    await fs.writeFile(
      scriptPath,
      '#!/bin/sh\nprintf "OK\\t%s/result.md\\n" "$2"\n',
      { mode: 0o755 }
    );
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite("https://example.com", tempDir);

    expect(result).toMatchObject({
      markdownPath: path.join(tempDir, "result.md"),
      crawl: {
        provider: "crawl4ai",
        outcome: "succeeded",
        sourceUrl: "https://example.com",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Firecrawl only after the wrapper explicitly returns ERR", async () => {
    const tempDir = await makeTempDir("one-box-crawl-fallback-");
    const scriptPath = path.join(tempDir, "crawl-fallback.sh");
    await fs.writeFile(
      scriptPath,
      '#!/bin/sh\nprintf "ERR\\tbot challenge detected\\n"\nexit 1\n',
      { mode: 0o755 }
    );
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { markdown: "# Fallback result" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite("https://example.com/pricing", tempDir, undefined, true);

    expect(result.crawl).toMatchObject({
      provider: "firecrawl",
      outcome: "succeeded",
      fallbackReason: "bot-challenge",
      paidFallbackApproved: true,
    });
    expect(result.crawlAttempts).toHaveLength(2);
    expect(result.crawlAttempts[0]).toMatchObject({
      provider: "crawl4ai",
      outcome: "failed",
      failureReason: "bot challenge detected",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/scrape",
      expect.objectContaining({ method: "POST" })
    );
    expect(await fs.readFile(result.markdownPath!, "utf8")).toBe("# Fallback result");
  });

  // Firecrawl is the standing fallback since 2026-08-16, so refusal is now the
  // explicitly-withheld case rather than the default — the refusal path itself
  // still has to hold, because the intake UI can still switch it off.
  it("does not call or bill Firecrawl after ERR when consent is withheld", async () => {
    const tempDir = await makeTempDir("one-box-crawl-no-consent-");
    const scriptPath = path.join(tempDir, "crawl-no-consent.sh");
    await fs.writeFile(scriptPath, '#!/bin/sh\nprintf "ERR\\tbot challenge\\n"\nexit 1\n', { mode: 0o755 });
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(
      "https://example.com/no-consent",
      tempDir,
      undefined,
      false
    );
    expect(result.error).toContain("did not authorize metered fallback");
    expect(result.crawlAttempts).toHaveLength(1);
    expect(result.crawlAttempts[0]).toMatchObject({ provider: "crawl4ai", outcome: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains both attempts when the authorized Firecrawl request throws", async () => {
    const tempDir = await makeTempDir("one-box-crawl-fetch-throw-");
    const scriptPath = path.join(tempDir, "crawl-fetch-throw.sh");
    await fs.writeFile(scriptPath, '#!/bin/sh\nprintf "ERR\\tbot challenge\\n"\nexit 1\n', { mode: 0o755 });
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await crawlSite("https://example.com/throw", tempDir, undefined, true);
    expect(result.crawlAttempts).toHaveLength(2);
    expect(result.crawlAttempts[0]).toMatchObject({ provider: "crawl4ai", outcome: "failed" });
    expect(result.crawlAttempts[1]).toMatchObject({
      provider: "firecrawl",
      outcome: "failed",
      paidFallbackApproved: true,
      failureReason: "network down",
    });
  });

  it("does not silently spend when the wrapper fails without an ERR signal", async () => {
    const tempDir = await makeTempDir("one-box-crawl-invalid-");
    const scriptPath = path.join(tempDir, "crawl-invalid.sh");
    await fs.writeFile(scriptPath, '#!/bin/sh\nprintf "unexpected output\\n"\nexit 1\n', {
      mode: 0o755,
    });
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite("https://example.com", tempDir);

    expect(result.error).toContain("did not return the documented OK or ERR status");
    expect(result.crawl).toMatchObject({ provider: "crawl4ai", outcome: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records an explicit ERR followed by a failed Firecrawl attempt", async () => {
    const tempDir = await makeTempDir("one-box-crawl-fallback-fail-");
    const scriptPath = path.join(tempDir, "crawl-fallback-fail.sh");
    await fs.writeFile(scriptPath, '#!/bin/sh\nprintf "ERR\\tlocal renderer failed\\n"\nexit 1\n', { mode: 0o755 });
    process.env.CRAWL4AI_SCRIPT_PATH = scriptPath;
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    const result = await crawlSite("https://example.com/fail", tempDir, undefined, true);
    expect(result).toMatchObject({
      error: expect.stringMatching(/503/),
      crawl: {
        provider: "firecrawl",
        outcome: "failed",
        fallbackReason: "local-failure",
        paidFallbackApproved: true,
      },
    });
    expect(result.crawlAttempts).toHaveLength(2);
  });

  it("reports a missing configured wrapper without entering Firecrawl fallback", async () => {
    process.env.CRAWL4AI_SCRIPT_PATH = "/missing/crawl4ai-scrape.sh";
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite("https://example.com", os.tmpdir());

    expect(result.error).toContain(
      'crawl4ai wrapper was not found or is not executable at "/missing/crawl4ai-scrape.sh"'
    );
    expect(result.error).toContain("Set CRAWL4AI_SCRIPT_PATH");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
