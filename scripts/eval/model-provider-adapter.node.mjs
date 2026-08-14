import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import {
  buildBenchmarkPrompt,
  createProviderAdapter,
  runCodexProcess,
  sha256,
} from "./model-provider-adapter.mjs";
import { prepareRound } from "./model-benchmark.mjs";

const REPOSITORY = path.resolve(import.meta.dirname, "../..");

function candidate(overrides = {}) {
  return {
    id: "sol-high",
    displayName: "GPT-5.6 Sol",
    modelSlug: "gpt-5.6-sol",
    provider: "Codex OAuth",
    modelFamily: "openai",
    effort: "high",
    pricingSnapshot: "Subscription; marginal API cost N/A",
    contextLimit: 400000,
    toolSupport: [],
    blindAliases: ["Sol", "GPT Sol"],
    accessLane: "subscription",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    roundId: "qualification-v1",
    candidate: candidate(),
    fixture: {
      id: "task-04-tailwind-tokens",
      version: "1.0.0",
      path: "docs/eval/model-routing/fixtures/task-04-tailwind-tokens-v1.md",
      taskClass: "tailwind-component-system",
      evaluationKind: "mechanical",
      sha256: sha256("fixture bytes\n"),
      bytes: Buffer.from("fixture bytes\n"),
    },
    repairRound: 0,
    policy: {
      timeLimitMs: 120000,
      toolPolicy: { network: false, allowedTools: [] },
      perTaskCapUsd: 0.5,
      maxRepairRounds: 1,
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function codexJsonl({ model = null, output = "bounded artifact\n" } = {}) {
  const completed = { type: "turn.completed", usage: { input_tokens: 101, cached_input_tokens: 11, output_tokens: 37 } };
  if (model) completed.model = model;
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "command_execution", command: "pwd", status: "completed" } }),
    JSON.stringify({ type: "item.completed", item: { id: "item-2", type: "agent_message", text: output } }),
    JSON.stringify(completed),
    "",
  ].join("\n");
}

test("buildBenchmarkPrompt is byte-stable and excludes producer identity and self-scoring", () => {
  const fixture = input().fixture;
  const first = buildBenchmarkPrompt(fixture);
  const second = buildBenchmarkPrompt({ ...fixture, bytes: Buffer.from(fixture.bytes) });
  assert.deepEqual(first, second);
  assert.equal(sha256(first), sha256(second));
  assert.match(first.toString("utf8"), /Do not score, grade, or claim acceptance/);
  assert.match(first.toString("utf8"), /fixture bytes/);
  assert.doesNotMatch(first.toString("utf8"), /gpt-5\.6|Codex OAuth|OpenRouter/);
});

test("Codex subscription execution uses exact model, effort, ephemeral read-only mode, and stdin", async () => {
  let captured;
  const adapter = createProviderAdapter({
    runCodex: async (request) => {
      captured = request;
      return { exitCode: 0, stdout: codexJsonl(), stderr: "" };
    },
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  });
  const result = await adapter(input());
  assert.deepEqual(captured.args.slice(0, 4), ["exec", "--ephemeral", "--sandbox", "read-only"]);
  assert.ok(captured.args.includes("shell_tool"));
  assert.ok(captured.args.includes('model="gpt-5.6-sol"'));
  assert.ok(captured.args.includes('model_reasoning_effort="high"'));
  assert.equal(captured.args.at(-1), "-");
  assert.deepEqual(captured.stdin, buildBenchmarkPrompt(input().fixture));
  assert.equal(result.status, "completed");
  assert.deepEqual(result.usage, { inputTokens: 101, outputTokens: 37, cachedTokens: 11 });
  assert.deepEqual(result.cost, { lane: "subscription", marginalApiCostUsd: null, reviewerTimeMinutes: 0 });
  assert.equal(result.context.producer.model.requested, "gpt-5.6-sol");
  assert.equal(result.context.producer.model.reported, null);
  assert.equal(result.context.producer.model.binding, "requested-only-unverified");
  assert.ok(result.acceptance.automaticRejections.includes("unverified_model_identity"));
  assert.equal(result.context.producer.effort, "high");
  assert.deepEqual(result.toolCalls, [{ name: "command_execution", count: 1 }]);
  assert.equal(result.acceptance.firstPassAccepted, false);
});

test("an unavailable Luna call fails under the exact Luna identity without fallback or relabeling", async () => {
  let captured;
  const adapter = createProviderAdapter({
    runCodex: async (request) => {
      captured = request;
      return { exitCode: 1, stdout: "", stderr: "Model gpt-5.6-luna is not available for this authenticated account" };
    },
  });
  const luna = candidate({ id: "luna-xhigh", displayName: "GPT-5.6 Luna", modelSlug: "gpt-5.6-luna", effort: "xhigh" });
  const result = await adapter(input({ candidate: luna }));
  assert.ok(captured.args.includes('model="gpt-5.6-luna"'));
  assert.equal(result.status, "unauthenticated");
  assert.equal(result.context.producer.model.requested, "gpt-5.6-luna");
  assert.equal(result.context.producer.model.reported, null);
  assert.ok(result.errors.some((error) => error.message.includes("gpt-5.6-luna")));
});

test("OpenRouter refuses an absent approved credential without making a request", async () => {
  let called = false;
  const adapter = createProviderAdapter({
    env: {},
    fetch: async () => {
      called = true;
      throw new Error("must not fetch");
    },
  });
  const grok = candidate({
    id: "grok-high",
    displayName: "Grok 4.6",
    modelSlug: "x-ai/grok-4.6",
    provider: "OpenRouter",
    effort: "high",
    pricingSnapshot: "$2/M input, $6/M output under 200k prompt tokens",
    contextLimit: 500000,
    accessLane: "metered",
  });
  const result = await adapter(input({ candidate: grok }));
  assert.equal(called, false);
  assert.equal(result.status, "unauthenticated");
  assert.equal(result.cost.providerCostUsd, null);
});

test("OpenRouter sends a bounded exact-model request and records provider usage and cost", async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      id: "gen-1",
      model: "x-ai/grok-4.6",
      provider: "xAI",
      choices: [{ message: { content: "bounded report\n" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 123,
        completion_tokens: 45,
        prompt_tokens_details: { cached_tokens: 9 },
        cost: 0.0042,
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const grok = candidate({
    id: "grok-high",
    displayName: "Grok 4.6",
    modelSlug: "x-ai/grok-4.6",
    provider: "OpenRouter",
    effort: "high",
    pricingSnapshot: "$2/M input, $6/M output under 200k prompt tokens",
    contextLimit: 500000,
    accessLane: "metered",
  });
  const adapter = createProviderAdapter({ env: { OPENROUTER_API_KEY: "test-secret" }, fetch: fakeFetch });
  const requestInput = input({ candidate: grok });
  const result = await adapter(requestInput);
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.body.model, "x-ai/grok-4.6");
  assert.deepEqual(request.body.reasoning, { effort: "high" });
  assert.equal(request.body.messages[0].content, buildBenchmarkPrompt(input().fixture).toString("utf8"));
  assert.equal(request.body.tools, undefined);
  assert.ok(Number.isInteger(request.body.max_tokens) && request.body.max_tokens > 0);
  assert.equal(request.options.signal, requestInput.signal);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.usage, { inputTokens: 123, outputTokens: 45, cachedTokens: 9 });
  assert.deepEqual(result.cost, { lane: "metered", providerCostUsd: 0.0042, reviewerTimeMinutes: 0 });
  assert.equal(result.context.producer.provider.reported, "xAI");
  assert.equal(result.context.producer.model.reported, "x-ai/grok-4.6");
  assert.doesNotMatch(JSON.stringify(result), /test-secret/);
});

test("OpenRouter propagates the coordinator AbortSignal and records abort as timed out", async () => {
  const controller = new AbortController();
  const adapter = createProviderAdapter({
    env: { OPENROUTER_API_KEY: "test-secret" },
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  const grok = candidate({ id: "grok-high", modelSlug: "x-ai/grok-4.6", provider: "OpenRouter", effort: "high", accessLane: "metered" });
  const pending = adapter(input({ candidate: grok, signal: controller.signal }));
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "timed_out");
  assert.equal(result.cost.providerCostUsd, null);
});

test("OpenRouter rejects truncated generations", async () => {
  const adapter = createProviderAdapter({
    env: { OPENROUTER_API_KEY: "test-secret" },
    fetch: async () => new Response(JSON.stringify({
      model: "x-ai/grok-4.6",
      provider: "xAI",
      choices: [{ message: { content: "truncated artifact" }, finish_reason: "length" }],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.001 },
    }), { status: 200 }),
  });
  const grok = candidate({ id: "grok-high", modelSlug: "x-ai/grok-4.6", provider: "OpenRouter", effort: "high", accessLane: "metered" });
  const result = await adapter(input({ candidate: grok }));
  assert.equal(result.status, "failed");
  assert.ok(result.errors.some((error) => error.code === "INCOMPLETE_GENERATION"));
  assert.equal(result.cost.providerCostUsd, 0.001);
});

test("OpenRouter fails closed when reported cost exceeds the registered task cap", async () => {
  const adapter = createProviderAdapter({
    env: { OPENROUTER_API_KEY: "test-secret" },
    fetch: async () => new Response(JSON.stringify({
      model: "x-ai/grok-4.6",
      provider: "xAI",
      choices: [{ message: { content: "artifact" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.75 },
    }), { status: 200 }),
  });
  const grok = candidate({ id: "grok-high", modelSlug: "x-ai/grok-4.6", provider: "OpenRouter", effort: "high", accessLane: "metered" });
  const result = await adapter(input({ candidate: grok }));
  assert.equal(result.status, "failed");
  assert.equal(result.cost.providerCostUsd, 0.75);
  assert.equal(result.context.budget.reportedProviderCostUsd, 0.75);
  assert.equal(result.context.budget.withinCap, false);
  assert.ok(result.errors.some((error) => error.code === "TASK_CAP_EXCEEDED"));
});

test("Codex records installed JSONL model metadata gaps as promotion-ineligible", async () => {
  const adapter = createProviderAdapter({
    runCodex: async () => ({ exitCode: 0, stdout: codexJsonl(), stderr: "" }),
  });
  const result = await adapter(input());
  assert.equal(result.status, "completed");
  assert.equal(result.context.producer.model.reported, null);
  assert.equal(result.context.producer.model.binding, "requested-only-unverified");
  assert.ok(result.acceptance.automaticRejections.includes("unverified_model_identity"));
});

test("Codex rejects an explicitly reported model mismatch", async () => {
  const adapter = createProviderAdapter({
    runCodex: async () => ({ exitCode: 0, stdout: codexJsonl({ model: "gpt-5.6-terra" }), stderr: "" }),
  });
  const result = await adapter(input());
  assert.equal(result.status, "failed");
  assert.ok(result.errors.some((error) => error.code === "MODEL_MISMATCH"));
});

test("provider adapter rejects repair rounds without a frozen repair packet before transport", async () => {
  let called = false;
  const adapter = createProviderAdapter({
    runCodex: async () => { called = true; },
  });
  const result = await adapter(input({ repairRound: 1 }));
  assert.equal(called, false);
  assert.equal(result.status, "failed");
  assert.ok(result.errors.some((error) => error.code === "REPAIR_PACKET_REQUIRED"));
});

test("runCodexProcess writes only to stdin and abort kills the child", async () => {
  let child;
  let received = Buffer.alloc(0);
  const spawn = () => {
    child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        received = Buffer.concat([received, Buffer.from(chunk)]);
        callback();
      },
    });
    child.killCalls = [];
    child.kill = (signal) => {
      child.killCalls.push(signal);
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    };
    return child;
  };
  const controller = new AbortController();
  const pending = runCodexProcess({ args: ["exec", "-"], stdin: Buffer.from("fixed\n"), signal: controller.signal, spawn, environment: { PATH: process.env.PATH } });
  controller.abort();
  const result = await pending;
  assert.deepEqual(received, Buffer.from("fixed\n"));
  assert.deepEqual(child.killCalls, ["SIGTERM"]);
  assert.equal(result.aborted, true);
});

test("unknown providers and model slugs fail closed before transport", async () => {
  let calls = 0;
  const adapter = createProviderAdapter({
    runCodex: async () => { calls += 1; },
    fetch: async () => { calls += 1; },
  });
  const result = await adapter(input({ candidate: candidate({ modelSlug: "gpt-5.6-sol; touch /tmp/pwned" }) }));
  assert.equal(calls, 0);
  assert.equal(result.status, "failed");
  assert.ok(result.errors.some((error) => error.code === "UNREGISTERED_CANDIDATE"));
});

test("the qualification config registers only tasks 4, 5, 8, 9 and exact candidate identities", async (context) => {
  const config = JSON.parse(await fs.readFile(path.join(REPOSITORY, "docs/eval/model-routing/configs/qualification-stratified-v1.json"), "utf8"));
  assert.deepEqual(config.fixtures.map((fixture) => fixture.id), [
    "task-04-tailwind-tokens",
    "task-05-resizable-workbench",
    "task-08-competitive-report",
    "task-09-seeded-code-review",
  ]);
  assert.deepEqual(config.candidates.map((entry) => [entry.id, entry.modelSlug, entry.provider, entry.effort]), [
    ["sol-high", "gpt-5.6-sol", "Codex OAuth", "high"],
    ["luna-xhigh", "gpt-5.6-luna", "Codex OAuth", "xhigh"],
    ["terra-xhigh", "gpt-5.6-terra", "Codex OAuth", "xhigh"],
    ["grok-4.6-high", "x-ai/grok-4.6", "OpenRouter", "high"],
  ]);
  assert.equal(config.protocol.perTaskCapUsd, 0.5);
  assert.equal(config.protocol.timeLimitMs, 600000);
  for (const fixture of config.fixtures) {
    const bytes = await fs.readFile(path.join(REPOSITORY, fixture.path));
    assert.ok(bytes.length > 0);
    assert.match(fixture.path, new RegExp(`task-${fixture.id.slice(5, 7)}-.+-v1\\.md$`));
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-provider-config-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const required = ["docs/eval/model-routing/benchmark-plan.md", ...config.fixtures.map((fixture) => fixture.path)];
  for (const relative of required) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relative), path.join(root, relative));
  }
  const prepared = await prepareRound({ root, roundId: "qualification-config-test", config });
  assert.equal(prepared.manifest.blinding.artifactCount, 16);
});
