/**
 * Gate C2 build harness.
 *
 * ReferenceContract + WITS copy -> LayoutProgramV1 -> compiled static site.
 *
 * Reuses spikes/layout-ir/{schema.mjs,compile.mjs,audit-css.mjs} UNCHANGED —
 * imported, not forked — plus its two shared, versioned CSS sheets
 * (layout-authority.css, chrome.css), copied byte-for-byte the same way
 * spikes/layout-ir/build.mjs does. Nothing in spikes/layout-ir/ is modified
 * by this spike.
 *
 *   node spikes/reference-contract/build.mjs
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseContract } from "./contract-schema.mjs";
import { contractToProgram } from "./compile-from-contract.mjs";
import { parseProgram } from "../layout-ir/schema.mjs";
import { compileLayoutProgram } from "../layout-ir/compile.mjs";
import { auditCss } from "../layout-ir/audit-css.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_IR = path.join(HERE, "..", "layout-ir");
const OUT = path.join(HERE, "out");
const FIXTURE = path.join(HERE, "fixtures", "wits");

const sha = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/** Same flat-field -> collections normalizer as spikes/layout-ir/build.mjs,
 * duplicated rather than imported because it is a private, unexported
 * function there — kept byte-identical in behaviour. */
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

async function buildOne(contractPath) {
  const contractRaw = JSON.parse(await readFile(contractPath, "utf8"));
  const contract = parseContract(contractRaw);

  const copyRaw = await readFile(path.join(FIXTURE, "copy.json"), "utf8");
  const copy = normalizeCopy(JSON.parse(copyRaw));
  const tokensCss = await readFile(path.join(FIXTURE, "tokens.css"), "utf8");

  const assets = { hero: `assets/hero-${contract.contractId}.jpg` };

  const { page, sections } = contractToProgram(contract, assets);
  const draft = {
    schemaVersion: "1",
    programId: contract.contractId,
    inputs: {
      designHash: sha(tokensCss),
      copyHash: sha(copyRaw),
      assetCatalogHash: sha(JSON.stringify(assets)),
    },
    page,
    sections,
  };

  const program = parseProgram(draft); // throws on any schema violation

  const { html, css, provenance } = compileLayoutProgram({ program, tokens: null, copy });

  const outDir = path.join(OUT, contract.contractId);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "assets"), { recursive: true });

  await writeFile(path.join(outDir, "index.html"), html, "utf8");
  await writeFile(path.join(outDir, "layout.css"), css, "utf8");
  await writeFile(path.join(outDir, "tokens.css"), tokensCss, "utf8");
  await copyFile(path.join(LAYOUT_IR, "chrome.css"), path.join(outDir, "chrome.css"));
  await copyFile(
    path.join(LAYOUT_IR, "layout-authority.css"),
    path.join(outDir, "layout-authority.css")
  );
  await writeFile(
    path.join(outDir, "provenance.json"),
    JSON.stringify(provenance, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outDir, "program.json"),
    JSON.stringify(program, null, 2),
    "utf8"
  );

  await copyFile(
    path.join(FIXTURE, "assets", `hero-${contract.contractId}.jpg`),
    path.join(outDir, assets.hero)
  );

  const authorityCss = await readFile(path.join(LAYOUT_IR, "layout-authority.css"), "utf8");
  const violations = auditCss({ css, tokensCss: `${tokensCss}\n${authorityCss}` });

  return {
    contractId: contract.contractId,
    sourceStyle: contract.sourceStyle,
    outDir,
    htmlHash: sha(html),
    cssHash: sha(css),
    declarations: provenance.length,
    sections: program.sections.map((s) => `${s.role}:${s.kernel.kind}`),
    violations,
  };
}

const contracts = [
  path.join(HERE, "contracts", "ambrook.contract.json"),
  path.join(HERE, "contracts", "pipe.contract.json"),
];

let failed = false;
for (const target of contracts) {
  const result = await buildOne(target);
  const status = result.violations.length ? "AUDIT FAIL" : "ok";
  console.log(`\n[${status}] ${result.contractId}  (source style ${result.sourceStyle.name})`);
  console.log(`  sections: ${result.sections.join(" > ")}`);
  console.log(`  html ${result.htmlHash}  css ${result.cssHash}  declarations ${result.declarations}`);
  if (result.violations.length) {
    failed = true;
    for (const v of result.violations.slice(0, 15)) {
      console.log(`   ! ${v.where} = ${v.value}  (${v.reason})`);
    }
  }
}
process.exit(failed ? 1 : 0);
