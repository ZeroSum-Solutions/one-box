import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssistantScopeNotFoundError,
  loadEditorThread,
  runAssistantTurn,
  type AssistantDeps,
} from "./assistant";
import { ARTIFACTS, type Intake } from "./contracts";

const temporaryRoots: string[] = [];
const runId = "assistant-test";
const now = new Date("2026-08-15T12:00:00.000Z");
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const intake: Intake = {
  businessName: "Northstar Plumbing",
  category: "plumber",
  location: "Portland, Oregon",
  services: ["Emergency repairs"],
  certifications: [],
  claims: [],
  primaryAction: "quote",
  projectTarget: "website",
  vibeWords: ["warm", "capable"],
  research: {
    enabled: true,
    businessIntelligence: true,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: false,
  },
  uploads: [],
};

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-assistant-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(
    path.join(root, "site", "index.html"),
    `<!doctype html><main>
      <section data-edit-id="hero-copy"><h1>Trusted plumbing for Portland homes</h1></section>
      <section data-edit-id="pricing-plans"><h2>Clear pricing</h2><p>Simple choices for every repair.</p></section>
      <section data-edit-id="contact-form"><h2>Book a visit</h2></section>
    </main>`,
  );
  return root;
}

/** A pricing section with a real descendant whose editId shares no
 * substring with its parent's -- proves subtree containment is read off the
 * live parentEditId chain, never guessed from an id string prefix. */
async function nestedFixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-assistant-scope-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "site"), { recursive: true });
  await fs.writeFile(
    path.join(root, "site", "index.html"),
    `<!doctype html><main>
      <section data-edit-id="hero-copy"><h1>Trusted plumbing for Portland homes</h1></section>
      <section data-edit-id="pricing-plans">
        <h2 data-edit-id="unrelated-descendant">Clear pricing</h2>
        <p>Simple choices for every repair.</p>
      </section>
      <section data-edit-id="contact-form"><h2>Book a visit</h2></section>
    </main>`,
  );
  return root;
}

function modelReply(overrides: Record<string, unknown> = {}) {
  return {
    reply: "I would make the choices easier to compare and keep the booking step visible.",
    evidence: [{ screenId: "screen-a", takeaway: "Clear tiers make the next step easy to spot." }],
    suggestions: [{
      id: "suggestion-1",
      editId: "pricing-plans",
      instruction: "Add a short label above each plan explaining who it suits.",
      summary: "Make plans easier to compare.",
    }],
    ...overrides,
  };
}

function deps(root: string, overrides: Partial<AssistantDeps> = {}): AssistantDeps {
  return {
    searchScreens: async () => [{ id: "screen-a", name: "Good Plumbing Co.", summary: "pricing cards" }],
    getScreenImage: async () => ({ data: png.toString("base64"), mimeType: "image/png" }),
    generateJson: async () => modelReply(),
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    mkdir: fs.mkdir,
    stat: fs.stat,
    now: () => now,
    loadRun: async () => ({ id: runId, costUsd: 0, costCapUsd: 5 }) as never,
    loadArtifact: async <T>(_: string, artifact: string) =>
      (artifact === ARTIFACTS.intake ? intake : undefined) as T | undefined,
    sitePaths: () => ({ root, research: path.join(root, "research"), site: path.join(root, "site"), uploads: path.join(root, "uploads") }),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("runAssistantTurn", () => {
  it("grounds suggestions in the live data-edit-id inventory parsed from the site", async () => {
    const root = await fixtureRoot();
    let prompt = "";
    const thread = await runAssistantTurn(
      runId,
      "Make my pricing section better",
      undefined,
      deps(root, { generateJson: async (_runId, _model, _schema, value) => { prompt = value; return modelReply(); } }),
    );

    expect(prompt).toContain("pricing-plans");
    expect(thread.messages.at(-1)).toMatchObject({
      role: "assistant",
      suggestions: [{ editId: "pricing-plans" }],
      evidence: [{ siteName: "Good Plumbing Co." }],
    });
  });

  it("researches a named section within the call limits and uses the disk cache on a later identical turn", async () => {
    const root = await fixtureRoot();
    let searches = 0;
    let thumbnails = 0;
    const injected = deps(root, {
      searchScreens: async () => {
        searches += 1;
        return [{ id: "screen-a", name: "Good Plumbing Co.", summary: "pricing cards" }];
      },
      getScreenImage: async () => {
        thumbnails += 1;
        return { data: png.toString("base64"), mimeType: "image/png" };
      },
    });

    await runAssistantTurn(runId, "Make my pricing section better", undefined, injected);
    expect(searches).toBeLessThanOrEqual(3);
    expect(thumbnails).toBeLessThanOrEqual(4);
    searches = 0;
    thumbnails = 0;

    await runAssistantTurn(runId, "Make my pricing section better", undefined, injected);
    expect(searches).toBe(0);
    expect(thumbnails).toBe(0);
  });

  it("does not spend Refero calls for a general question", async () => {
    const root = await fixtureRoot();
    let searches = 0;
    const thread = await runAssistantTurn(
      runId,
      "What would you improve first?",
      undefined,
      deps(root, { searchScreens: async () => { searches += 1; return []; } }),
    );

    expect(searches).toBe(0);
    expect(thread.messages.at(-1)?.role).toBe("assistant");
  });

  it("plainly degrades before research when the remaining build budget is short", async () => {
    const root = await fixtureRoot();
    let searches = 0;
    const thread = await runAssistantTurn(
      runId,
      "Make my pricing section better",
      undefined,
      deps(root, {
        loadRun: async () => ({ id: runId, costUsd: 0.6, costCapUsd: 1 }) as never,
        searchScreens: async () => { searches += 1; return []; },
      }),
    );

    expect(searches).toBe(0);
    expect(thread.messages.at(-1)).toMatchObject({
      role: "assistant",
      reply: expect.stringContaining("deeper research would go past this build's budget"),
    });
  });

  it("retries a model response that targets a foreign edit id, then pins a safe no-suggestions reply", async () => {
    const root = await fixtureRoot();
    let calls = 0;
    const thread = await runAssistantTurn(
      runId,
      "Make my pricing section better",
      undefined,
      deps(root, {
        generateJson: async () => {
          calls += 1;
          return modelReply({ suggestions: [{ id: "bad", editId: "not-on-this-site", instruction: "Change it", summary: "Bad target" }] });
        },
      }),
    );

    expect(calls).toBe(2);
    expect(thread.messages.at(-1)).toMatchObject({
      role: "assistant",
      suggestions: [],
      reply: expect.stringContaining("couldn't safely prepare an edit suggestion"),
    });
  });

  it("persists atomically and prunes the oldest messages beyond sixty", async () => {
    const root = await fixtureRoot();
    const existing = {
      messages: Array.from({ length: 60 }, (_, index) => ({
        id: `old-${index}`,
        role: "assistant",
        reply: `Past reply ${index}`,
        at: now.toISOString(),
        evidence: [],
        suggestions: [],
      })),
      updatedAt: now.toISOString(),
    };
    await fs.writeFile(path.join(root, ARTIFACTS.editorThread), JSON.stringify(existing));

    const thread = await runAssistantTurn(runId, "What would you improve first?", undefined, deps(root));
    expect(thread.messages).toHaveLength(60);
    expect(thread.messages[0]?.id).toBe("old-2");
    expect(JSON.parse(await fs.readFile(path.join(root, ARTIFACTS.editorThread), "utf8"))).toEqual(thread);
  });

  it("continues an unfinished identical owner turn instead of appending it twice", async () => {
    const root = await fixtureRoot();
    await fs.writeFile(path.join(root, ARTIFACTS.editorThread), JSON.stringify({
      messages: [{ id: "pending-owner", role: "owner", text: "What would you improve first?", at: new Date(now.getTime() - 60_000).toISOString() }],
      updatedAt: new Date(now.getTime() - 60_000).toISOString(),
    }));

    const thread = await runAssistantTurn(runId, "What would you improve first?", undefined, deps(root));
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({ id: "pending-owner", role: "owner" });
    expect(thread.messages[1]?.role).toBe("assistant");
  });
});

// Selection-Scoped Assistant References (canvas-upgrade Wave 6, Play 5).
describe("runAssistantTurn with a selection scope", () => {
  it("rejects a malformed selection scope and never reaches the model", async () => {
    const root = await fixtureRoot();
    let calls = 0;
    await expect(
      runAssistantTurn(
        runId,
        "make this punchier",
        "not a valid id!",
        deps(root, { generateJson: async () => { calls += 1; return modelReply(); } }),
      ),
    ).rejects.toThrow(/valid element id/);
    expect(calls).toBe(0);
  });

  it("rejects a selection scope that is not in this run's live inventory", async () => {
    const root = await fixtureRoot();
    await expect(
      runAssistantTurn(runId, "make this punchier", "not-a-real-section", deps(root)),
    ).rejects.toThrow(AssistantScopeNotFoundError);
  });

  it("does not persist the owner turn when the selection scope is rejected", async () => {
    const root = await fixtureRoot();
    await expect(
      runAssistantTurn(runId, "make this punchier", "not-a-real-section", deps(root)),
    ).rejects.toThrow(AssistantScopeNotFoundError);
    const thread = await loadEditorThread(runId, deps(root));
    expect(thread.messages).toHaveLength(0);
  });

  it("biases the prompt and the model's addressable inventory toward the selected element's own subtree", async () => {
    const root = await nestedFixtureRoot();
    let prompt = "";
    await runAssistantTurn(
      runId,
      "make this punchier",
      "pricing-plans",
      deps(root, {
        generateJson: async (_runId, _model, _schema, value) => {
          prompt = value;
          return modelReply({ suggestions: [{ id: "s1", editId: "unrelated-descendant", instruction: "Tighten the heading.", summary: "Tighten heading" }] });
        },
      }),
    );

    expect(prompt).toContain("SELECTION SCOPE");
    expect(prompt).toContain("pricing-plans");
    expect(prompt).toContain("unrelated-descendant");
    expect(prompt).not.toContain("hero-copy");
    expect(prompt).not.toContain("contact-form");
  });

  it("keeps a suggestion that targets a real descendant of the selected scope", async () => {
    const root = await nestedFixtureRoot();
    const thread = await runAssistantTurn(
      runId,
      "make this punchier",
      "pricing-plans",
      deps(root, {
        generateJson: async () =>
          modelReply({ suggestions: [{ id: "s1", editId: "unrelated-descendant", instruction: "Tighten the heading.", summary: "Tighten heading" }] }),
      }),
    );

    expect(thread.messages.at(-1)).toMatchObject({
      role: "assistant",
      suggestions: [{ editId: "unrelated-descendant" }],
    });
  });

  // The verification split for this play: the OUTGOING half (the client
  // sending scopeEditId) is proven live in the browser; this is the
  // RETURNED half, model boundary mocked. Without the scope restriction on
  // responseSchema()'s editId enum, "hero-copy" is a valid site-wide editId
  // and this suggestion would pass straight through -- this test fails
  // without that change.
  it("drops a suggestion that points outside the selected scope, retrying then pinning a safe no-suggestions reply", async () => {
    const root = await nestedFixtureRoot();
    let calls = 0;
    const thread = await runAssistantTurn(
      runId,
      "make this punchier",
      "pricing-plans",
      deps(root, {
        generateJson: async () => {
          calls += 1;
          return modelReply({ suggestions: [{ id: "s1", editId: "hero-copy", instruction: "Change the hero instead.", summary: "Wander off scope" }] });
        },
      }),
    );

    expect(calls).toBe(2);
    expect(thread.messages.at(-1)).toMatchObject({
      role: "assistant",
      suggestions: [],
      reply: expect.stringContaining("couldn't safely prepare an edit suggestion"),
    });
  });
});
