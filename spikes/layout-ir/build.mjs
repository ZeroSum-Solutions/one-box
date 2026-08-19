/**
 * Spike harness. Compiles a hand-authored LayoutProgramV1 against a real run's
 * APPROVED artifacts (tokens, copy, hero asset) and writes a static site.
 *
 * Nothing here calls a model. Nothing here is wired into the pipeline.
 *
 *   node spikes/layout-ir/build.mjs <programFile> [...more]
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseProgram } from "./schema.mjs";
import { compileLayoutProgram } from "./compile.mjs";
import { auditCss } from "./audit-css.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(HERE, "out");

const sha = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/**
 * Approved copy uses flat numbered fields (card-1-title, area-3, ...).
 * Group them into collections WITHOUT inventing or rewording anything.
 */
function normalizeCopy(copy) {
  const collections = {};
  for (const [sectionKey, fields] of Object.entries(copy.sections ?? {})) {
    const grouped = new Map();
    for (const [field, value] of Object.entries(fields)) {
      const paired = field.match(/^(.*?)-(\d+)-(title|body|value|label)$/);
      const single = field.match(/^(.*?)-(\d+)$/);
      if (paired) {
        const [, stem, index, part] = paired;
        const key = `${sectionKey}.${stem}`;
        if (!grouped.has(key)) grouped.set(key, new Map());
        const bucket = grouped.get(key);
        if (!bucket.has(index)) bucket.set(index, {});
        const slot = part === "value" ? "title" : part === "label" ? "body" : part;
        bucket.get(index)[slot] = value;
      } else if (single) {
        const [, stem, index] = single;
        const key = `${sectionKey}.${stem}`;
        if (!grouped.has(key)) grouped.set(key, new Map());
        const bucket = grouped.get(key);
        if (!bucket.has(index)) bucket.set(index, {});
        bucket.get(index).title = value;
      }
    }
    for (const [key, bucket] of grouped) {
      collections[key] = [...bucket.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, item]) => item);
    }
  }
  return { ...copy, collections };
}

async function loadSource(runId) {
  const runDir = path.join(REPO, "sites", runId);
  const [tokensRaw, copyRaw, tokensCss] = await Promise.all([
    readFile(path.join(runDir, "tokens.json"), "utf8"),
    readFile(path.join(runDir, "copy.json"), "utf8"),
    readFile(path.join(runDir, "site", "tokens.css"), "utf8"),
  ]);
  return {
    runDir,
    tokens: JSON.parse(tokensRaw),
    copy: normalizeCopy(JSON.parse(copyRaw)),
    tokensCss,
    hashes: {
      designHash: sha(tokensRaw),
      copyHash: sha(copyRaw),
      assetCatalogHash: sha(runId),
    },
  };
}

async function buildOne(programPath) {
  const raw = await readFile(programPath, "utf8");
  const parsed = JSON.parse(raw);
  const sourceRunId = parsed.$sourceRun;
  if (!sourceRunId) throw new Error(`${programPath}: missing $sourceRun`);
  delete parsed.$sourceRun;
  const note = parsed.$note;
  delete parsed.$note;

  const source = await loadSource(sourceRunId);
  parsed.inputs = source.hashes;

  const program = parseProgram(parsed);
  const { html, css, provenance } = compileLayoutProgram({
    program,
    tokens: source.tokens,
    copy: source.copy,
  });

  const outDir = path.join(OUT, program.programId);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "assets"), { recursive: true });

  await writeFile(path.join(outDir, "index.html"), html, "utf8");
  await writeFile(path.join(outDir, "layout.css"), css, "utf8");
  await writeFile(path.join(outDir, "tokens.css"), source.tokensCss, "utf8");
  await copyFile(path.join(HERE, "chrome.css"), path.join(outDir, "chrome.css"));
  await copyFile(
    path.join(HERE, "layout-authority.css"),
    path.join(outDir, "layout-authority.css")
  );
  await writeFile(
    path.join(outDir, "provenance.json"),
    JSON.stringify(provenance, null, 2),
    "utf8"
  );

  // Approved assets, copied by reference only.
  for (const section of program.sections) {
    for (const slot of section.slots) {
      if (!slot.assetRef) continue;
      const from = path.join(source.runDir, "site", slot.assetRef);
      await copyFile(from, path.join(outDir, slot.assetRef));
    }
  }

  // The audit's declared-token set is the approved run tokens PLUS the
  // versioned layout authority — and nothing else.
  const authorityCss = await readFile(path.join(HERE, "layout-authority.css"), "utf8");
  const violations = auditCss({
    css,
    tokensCss: `${source.tokensCss}\n${authorityCss}`,
  });

  return {
    programId: program.programId,
    sourceRunId,
    note,
    outDir,
    htmlHash: sha(html),
    cssHash: sha(css),
    declarations: provenance.length,
    sections: program.sections.map((s) => `${s.role}:${s.kernel.kind}`),
    violations,
  };
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("usage: node spikes/layout-ir/build.mjs <program.json> [...]");
  process.exit(1);
}

let failed = false;
for (const target of targets) {
  const result = await buildOne(path.resolve(target));
  const status = result.violations.length ? "AUDIT FAIL" : "ok";
  console.log(`\n[${status}] ${result.programId}  (source run ${result.sourceRunId})`);
  if (result.note) console.log(`  intent: ${result.note}`);
  console.log(`  sections: ${result.sections.join(" > ")}`);
  console.log(`  html ${result.htmlHash}  css ${result.cssHash}  declarations ${result.declarations}`);
  if (result.violations.length) {
    failed = true;
    for (const v of result.violations.slice(0, 15)) {
      console.log(`   ! ${v.where} = ${v.value}  (${v.reason})`);
    }
    if (result.violations.length > 15) {
      console.log(`   ... and ${result.violations.length - 15} more`);
    }
  }
}
process.exit(failed ? 1 : 0);
