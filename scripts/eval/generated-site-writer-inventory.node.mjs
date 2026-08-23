import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repository = path.resolve(import.meta.dirname, "../..");
const sourceRoot = path.join(repository, "src");
const inventoryPath = path.join(
  repository,
  "docs/architecture/generated-site-writer-inventory.md",
);
const permittedAuthorities = [
  "candidate-compiler",
  "guarded-mutation",
  "promotion-recovery",
  "test-only",
];
const mutationTargetIndexes = new Map([
  ["appendFile", 0],
  ["atomicWrite", 0],
  ["atomicWriteGeneratedSiteFile", 1],
  ["copyFile", 1],
  ["cp", 1],
  ["link", 1],
  ["mkdir", 0],
  ["rename", 1],
  ["rm", 0],
  ["rmdir", 0],
  ["symlink", 1],
  ["truncate", 0],
  ["unlink", 0],
  ["writeFile", 0],
  ["writeFileSync", 0],
]);

function productionTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(absolute);
    if (!/\.tsx?$/.test(entry.name) || /(?:\.test|\.fixture\.test|\.d)\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [absolute];
  });
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
  }
  return "<module>";
}

function declarationsVisibleFrom(node) {
  const declarations = new Map();
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) continue;
    const visit = (current) => {
      if (current !== scope && ts.isFunctionLike(current)) return;
      if (
        ts.isVariableDeclaration(current) &&
        ts.isIdentifier(current.name) &&
        current.initializer &&
        !declarations.has(current.name.text)
      ) {
        declarations.set(current.name.text, current.initializer);
      }
      ts.forEachChild(current, visit);
    };
    visit(scope);
  }
  return declarations;
}

function expandedExpression(node, declarations, seen = new Set()) {
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text) || !declarations.has(node.text)) return node.text;
    return expandedExpression(declarations.get(node.text), declarations, new Set([...seen, node.text]));
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${expandedExpression(node.expression, declarations, seen)}.${node.name.text}`;
  }
  if (ts.isCallExpression(node)) {
    return `${expandedExpression(node.expression, declarations, seen)}(${node.arguments
      .map((argument) => expandedExpression(argument, declarations, seen))
      .join(",")})`;
  }
  if (ts.isTemplateExpression(node)) {
    return `${JSON.stringify(node.head.text)}${node.templateSpans
      .map(
        (span) =>
          `+${expandedExpression(span.expression, declarations, seen)}+${JSON.stringify(span.literal.text)}`,
      )
      .join("")}`;
  }
  if (ts.isStringLiteralLike(node)) return JSON.stringify(node.text);
  return node.getText();
}

function mutationTarget(node) {
  if (!ts.isCallExpression(node)) return undefined;
  const operation = calleeName(node.expression);
  if (!operation || !mutationTargetIndexes.has(operation)) return undefined;
  const targetIndex = mutationTargetIndexes.get(operation);
  const target = node.arguments[targetIndex];
  if (!target) return undefined;
  return {
    operation,
    expandedTarget: expandedExpression(target, declarationsVisibleFrom(node)),
  };
}

function insideGuardedMutation(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isPropertyAssignment(current)) continue;
    const property = current.name.getText().replace(/["']/g, "");
    if (property !== "mutate" && property !== "commit") continue;
    const object = current.parent;
    const call = object.parent;
    if (
      ts.isObjectLiteralExpression(object) &&
      ts.isCallExpression(call) &&
      calleeName(call.expression) === "runGuardedMutation"
    ) {
      return true;
    }
  }
  return false;
}

function namedFunction(node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return { name: node.name.text, node };
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return { name: node.parent.name.text, node };
  }
  return undefined;
}

function guardedCallbackWrappers(sources) {
  const definitions = new Map();
  for (const { sourceFile } of sources) {
    const visit = (node) => {
      const definition = namedFunction(node);
      if (definition) {
        const guardedParameterIndexes = new Set();
        definition.node.parameters.forEach((parameter, index) => {
          if (!ts.isIdentifier(parameter.name)) return;
          const references = [];
          const visitReference = (current) => {
            if (
              current !== definition.node &&
              ts.isFunctionLike(current) &&
              current.parameters.some(
                (nestedParameter) =>
                  ts.isIdentifier(nestedParameter.name) &&
                  nestedParameter.name.text === parameter.name.text,
              )
            ) {
              return;
            }
            if (
              ts.isIdentifier(current) &&
              current !== parameter.name &&
              current.text === parameter.name.text
            ) {
              references.push(current);
            }
            ts.forEachChild(current, visitReference);
          };
          visitReference(definition.node.body);
          if (
            references.length > 0 &&
            references.every(
              (reference) =>
                ts.isCallExpression(reference.parent) &&
                reference.parent.expression === reference &&
                insideGuardedMutation(reference.parent),
            )
          ) {
            guardedParameterIndexes.add(index);
          }
        });
        const existing = definitions.get(definition.name) ?? [];
        existing.push(guardedParameterIndexes);
        definitions.set(definition.name, existing);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const wrappers = new Map();
  for (const [name, candidates] of definitions) {
    if (candidates.length === 1 && candidates[0].size > 0) {
      wrappers.set(name, candidates[0]);
    }
  }
  return wrappers;
}

function insideGuardedWrapperCallback(node, wrappers) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) {
      continue;
    }
    const call = current.parent;
    if (!ts.isCallExpression(call)) continue;
    const argumentIndex = call.arguments.indexOf(current);
    if (argumentIndex < 0) continue;
    if (wrappers.get(calleeName(call.expression))?.has(argumentIndex)) {
      return true;
    }
  }
  return false;
}

function parsedSources() {
  return productionTypeScriptFiles(sourceRoot).map((absolute) => {
    const source = fs.readFileSync(absolute, "utf8");
    return {
      absolute,
      source,
      sourceFile: ts.createSourceFile(
        absolute,
        source,
        ts.ScriptTarget.Latest,
        true,
        absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    };
  });
}

function directLiveSiteWrites(sources) {
  const findings = [];
  const wrappers = guardedCallbackWrappers(sources);
  for (const { absolute, sourceFile } of sources) {
    const visit = (node) => {
      const mutation = mutationTarget(node);
      if (
        mutation &&
        (mutation.operation === "atomicWriteGeneratedSiteFile" ||
          /\b(?:files|roots)\.site\b/.test(mutation.expandedTarget) ||
          /\b(?:libraryPaths|sitePaths)\([^)]*\)\.site\b/.test(
            mutation.expandedTarget,
          ) ||
          /path\.join\([^)]*,"site"(?:,|\))/.test(mutation.expandedTarget))
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const modulePath = path.relative(repository, absolute);
        const functionName = enclosingFunction(node);
        findings.push({
          scannerKey: `live:${modulePath}#${functionName}`,
          module: modulePath,
          function: functionName,
          operation: mutation.operation,
          line: position.line + 1,
          target: mutation.expandedTarget,
          guarded:
            insideGuardedMutation(node) ||
            insideGuardedWrapperCallback(node, wrappers),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function guardedMutationKeys(sources) {
  const keys = new Set();
  for (const { absolute, sourceFile } of sources) {
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node.expression) === "runGuardedMutation"
      ) {
        keys.add(
          `guarded:${path.relative(repository, absolute)}#${enclosingFunction(node)}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return keys;
}

function candidateWriterModuleKeys(sources) {
  const keys = new Set();
  for (const { absolute, source, sourceFile } of sources) {
    let hasMutation = false;
    const visit = (node) => {
      if (mutationTarget(node)) hasMutation = true;
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!hasMutation) continue;
    const importsCandidatePaths = sourceFile.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.elements.some(
          (element) => element.name.text === "candidatePaths",
        ),
    );
    const constructsCandidateRoot =
      /path\.join\([^;\n]*["']candidate["']/.test(source);
    if (importsCandidatePaths || constructsCandidateRoot) {
      keys.add(`candidate-module:${path.relative(repository, absolute)}`);
    }
  }
  return keys;
}

function readInventory() {
  const markdown = fs.readFileSync(inventoryPath, "utf8");
  const match = markdown.match(/```json inventory\n([\s\S]*?)\n```/);
  assert.ok(match, "writer inventory must contain one `json inventory` block");
  return JSON.parse(match[1]);
}

function allScannerKeys(inventory) {
  return inventory.writers.flatMap((writer) => writer.scannerKeys);
}

function filePart(reference) {
  return reference.split("#", 1)[0];
}

function fixtureSource(modulePath, source) {
  const absolute = path.join(repository, modulePath);
  return {
    absolute,
    source,
    sourceFile: ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

const sources = parsedSources();
const liveWrites = directLiveSiteWrites(sources);

test("higher-order guard status follows the wrapper callback flow", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/wrappers.ts",
      `
        export function guardedWrapper(callback: () => Promise<void>) {
          return runGuardedMutation({ mutate: async () => callback() });
        }
        export function misleadingWrapper(callback: () => Promise<void>) {
          callback();
          return runGuardedMutation({ mutate: async () => undefined });
        }
      `,
    ),
    fixtureSource(
      "fixtures/callers.ts",
      `
        export async function callbackGuarded() {
          return guardedWrapper(async () => {
            await atomicWriteGeneratedSiteFile("run", "target", "bytes");
          });
        }
        export async function writeOutsideCallback() {
          await atomicWriteGeneratedSiteFile("run", "target", "bytes");
          return guardedWrapper(async () => undefined);
        }
        export async function callbackOutsideGuard() {
          return misleadingWrapper(async () => {
            await atomicWriteGeneratedSiteFile("run", "target", "bytes");
          });
        }
      `,
    ),
  ];
  const guardStatus = new Map(
    directLiveSiteWrites(fixtureSources).map((finding) => [
      finding.function,
      finding.guarded,
    ]),
  );
  assert.deepEqual(guardStatus, new Map([
    ["callbackGuarded", true],
    ["writeOutsideCallback", false],
    ["callbackOutsideGuard", false],
  ]));
});

test("generated-site write primitives remain inside guarded mutation", () => {
  const primitiveWrites = liveWrites.filter(
    (finding) => finding.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.ok(
    primitiveWrites.length > 0,
    "atomicWriteGeneratedSiteFile callsites must remain statically visible",
  );
  assert.deepEqual(
    primitiveWrites.filter((finding) => !finding.guarded),
    [],
    "atomicWriteGeneratedSiteFile must only run inside runGuardedMutation",
  );
});

test("checked-in inventory covers the statically discovered generated-site writer surface", () => {
  const inventory = readInventory();
  assert.equal(inventory.schemaVersion, 1);
  assert.deepEqual(inventory.permittedAuthorities, permittedAuthorities);
  assert.ok(Array.isArray(inventory.writers) && inventory.writers.length > 0);

  for (const writer of inventory.writers) {
    assert.match(writer.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.ok(writer.endpoints.length > 0, `${writer.id}: endpoints required`);
    assert.ok(writer.modules.length > 0, `${writer.id}: modules required`);
    assert.ok(writer.filesWritten.length > 0, `${writer.id}: filesWritten required`);
    assert.ok(writer.snapshotSet.length > 0, `${writer.id}: snapshotSet required`);
    assert.ok(writer.owningTests.length > 0, `${writer.id}: owningTests required`);
    assert.ok(writer.scannerKeys.length > 0, `${writer.id}: scannerKeys required`);
    assert.ok(
      permittedAuthorities.includes(writer.authority) ||
        writer.authority === "unclassified-write-around",
      `${writer.id}: unknown authority ${writer.authority}`,
    );
    assert.equal(
      writer.status,
      writer.authority === "unclassified-write-around" ? "open" : "compliant",
      `${writer.id}: status must agree with authority`,
    );
    for (const modulePath of writer.modules) {
      assert.ok(
        fs.existsSync(path.join(repository, filePart(modulePath))),
        `${writer.id}: missing ${modulePath}`,
      );
    }
    for (const owningTest of writer.owningTests) {
      assert.ok(
        fs.existsSync(path.join(repository, filePart(owningTest))),
        `${writer.id}: missing ${owningTest}`,
      );
    }
  }

  const inventoriedKeys = allScannerKeys(inventory);
  assert.equal(new Set(inventoriedKeys).size, inventoriedKeys.length, "scanner keys must be unique");
  const discoveredKeys = [
    ...guardedMutationKeys(sources),
    ...candidateWriterModuleKeys(sources),
    ...new Set(liveWrites.map((finding) => finding.scannerKey)),
  ].sort();
  assert.deepEqual(inventoriedKeys.slice().sort(), discoveredKeys);
});

test("production live-site writes use only guarded mutation or promotion/recovery authority", () => {
  const inventory = readInventory();
  const writerByScannerKey = new Map(
    inventory.writers.flatMap((writer) =>
      writer.scannerKeys.map((scannerKey) => [scannerKey, writer]),
    ),
  );
  const violations = liveWrites.filter((finding) => {
    const writer = writerByScannerKey.get(finding.scannerKey);
    if (!writer) return true;
    if (writer.authority === "promotion-recovery") return false;
    return writer.authority !== "guarded-mutation" || !finding.guarded;
  });
  assert.deepEqual(
    violations,
    [],
    `direct live-site write-arounds:\n${violations
      .map((finding) =>
        `${finding.module}:${finding.line} ${finding.function} ${finding.operation} -> ${finding.target}`,
      )
      .join("\n")}`,
  );
});
