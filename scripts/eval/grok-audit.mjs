#!/usr/bin/env node
/**
 * Independent Grok audit harness for /goal task slices.
 *
 * The caller supplies a Git base, an explicit changed-file allowlist, criterion,
 * and proof paths. The script resolves the diff itself and sends it directly to
 * OpenRouter; keys never appear in argv, source, prompts, or output artifacts.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const MAX_INPUT_BYTES = 900_000;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { files: [], proofs: [], model: "x-ai/grok-4.6" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${key}`);
    index += 1;
    if (key === "--file") options.files.push(value);
    else if (key === "--proof") options.proofs.push(value);
    else if (key === "--task") options.task = value;
    else if (key === "--base") options.base = value;
    else if (key === "--criterion") options.criterion = value;
    else if (key === "--out") options.out = value;
    else if (key === "--model") options.model = value;
    else fail(`unknown argument: ${key}`);
  }
  for (const required of ["task", "base", "criterion", "out"]) {
    if (!options[required]) fail(`missing --${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  }
  if (options.files.length === 0) fail("at least one --file is required");
  return options;
}

function resolveInsideRoot(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    fail(`path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    maxBuffer: MAX_INPUT_BYTES + 100_000,
  });
  return stdout;
}

async function isTracked(file) {
  try {
    await git(["ls-files", "--error-unmatch", "--", file]);
    return true;
  } catch {
    return false;
  }
}

async function untrackedPatch(file) {
  try {
    await execFileAsync("git", ["diff", "--no-index", "--no-ext-diff", "--unified=80", "--", "/dev/null", file], {
      cwd: ROOT,
      maxBuffer: MAX_INPUT_BYTES + 100_000,
    });
    return "";
  } catch (error) {
    if (error && typeof error === "object" && error.code === 1 && typeof error.stdout === "string") {
      return error.stdout;
    }
    throw error;
  }
}

const options = parseArgs(process.argv.slice(2));
await git(["rev-parse", "--verify", `${options.base}^{commit}`]);

const files = [...new Set(options.files)].sort();
for (const file of files) resolveInsideRoot(file);
for (const proof of options.proofs) resolveInsideRoot(proof);

const trackedFlags = await Promise.all(files.map(isTracked));
const trackedFiles = files.filter((_, index) => trackedFlags[index]);
const untrackedFiles = files.filter((_, index) => !trackedFlags[index]);
const [head, trackedStatus, trackedDiff, ...untrackedDiffs] = await Promise.all([
  git(["rev-parse", "HEAD"]).then((value) => value.trim()),
  trackedFiles.length > 0
    ? git(["diff", "--name-status", options.base, "--", ...trackedFiles])
    : Promise.resolve(""),
  trackedFiles.length > 0
    ? git(["diff", "--no-ext-diff", "--unified=80", options.base, "--", ...trackedFiles])
    : Promise.resolve(""),
  ...untrackedFiles.map(untrackedPatch),
]);
const nameStatus = [
  trackedStatus.trim(),
  ...untrackedFiles.map((file) => `A\t${file}`),
]
  .filter(Boolean)
  .join("\n");
const diff = [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n");
if (!diff.trim()) fail("selected files have no diff against the requested base");
if (Buffer.byteLength(diff) > MAX_INPUT_BYTES) {
  fail(`selected diff exceeds ${MAX_INPUT_BYTES} bytes; split the task slice`);
}

const proofSections = [];
for (const proof of options.proofs) {
  const content = await fs.readFile(resolveInsideRoot(proof), "utf8");
  proofSections.push(`### ${proof}\n${content.slice(0, 80_000)}`);
}

const auditPrompt = `You are the independent adversarial reviewer for a bounded software task. Review only the supplied Git slice and proof. Do not praise. Hunt for correctness, security, authorization, data-lifecycle, concurrency, accessibility, responsive, state-machine, silent-failure, and test-oracle defects that could invalidate the criterion.

TASK: ${options.task}
BASE REF: ${options.base}
WORKTREE HEAD: ${head}
CHANGED FILE ALLOWLIST:\n${files.map((file) => `- ${file}`).join("\n")}
NAME STATUS:\n${nameStatus.trim()}
CRITERION:\n${options.criterion}

For every finding, give severity BLOCK/HIGH/MEDIUM/LOW, file and precise line or symbol, concrete input/state -> wrong behavior, and smallest safe remediation. Treat deterministic proof as evidence, not authority. If there are no findings at MEDIUM or above, say CLEAN explicitly. Return JSON only with this shape:
{"verdict":"CLEAN|FINDINGS","findings":[{"severity":"BLOCK|HIGH|MEDIUM|LOW","file":"path","line":"line or symbol","scenario":"...","remediation":"..."}],"proof_assessment":"...","residual_risks":["..."]}`;

const patchDocument = [
  `# Git diff ${options.base}..${head}`,
  "",
  diff,
  "",
  "# Proof artifacts",
  "",
  proofSections.join("\n\n"),
].join("\n");

const requestSummary = {
  task: options.task,
  model: options.model,
  base: options.base,
  head,
  files,
  proofs: options.proofs,
  diffBytes: Buffer.byteLength(diff),
};

if (options.dryRun) {
  console.log(JSON.stringify(requestSummary, null, 2));
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) fail("OPENROUTER_API_KEY is not set; load it through ZS Vault first");

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/wiggdevin/one-box",
    "X-Title": "One-Box goal audit",
  },
  body: JSON.stringify({
    model: options.model,
    reasoning: { effort: "high" },
    temperature: 0,
    max_tokens: 12_000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: auditPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read the attached repository diff and proof directly. Audit the stated criterion.",
          },
          {
            type: "file",
            file: {
              filename: `${options.task}-diff-and-proof.md`,
              file_data: `data:text/markdown;base64,${Buffer.from(patchDocument).toString("base64")}`,
            },
          },
        ],
      },
    ],
  }),
});

const raw = await response.text();
if (!response.ok) {
  const sanitized = raw.replaceAll(apiKey, "[redacted]").slice(0, 4_000);
  fail(`OpenRouter ${response.status}: ${sanitized}`);
}

const envelope = JSON.parse(raw);
const content = envelope.choices?.[0]?.message?.content;
if (typeof content !== "string" || !content.trim()) {
  fail("OpenRouter returned no audit content");
}
let audit;
try {
  audit = JSON.parse(content);
} catch {
  fail("Grok audit was not valid JSON");
}

const output = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  request: requestSummary,
  provider: {
    id: envelope.provider ?? null,
    model: envelope.model ?? options.model,
    usage: envelope.usage ?? null,
  },
  audit,
};
const outputPath = resolveInsideRoot(options.out);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: options.out, verdict: audit.verdict, findings: audit.findings?.length ?? 0 }));
