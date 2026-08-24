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

function importedNames(sourceFile) {
  const aliases = new Map();
  for (const statement of sourceFile.statements) {
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      aliases.set(
        element.name.text,
        element.propertyName?.text ?? element.name.text,
      );
    }
  }
  return aliases;
}

function importedMutationAliases(sourceFile) {
  const aliases = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (
      !["node:fs", "node:fs/promises", "./siteMutation", "../lib/siteMutation"].includes(
        statement.moduleSpecifier.text,
      )
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (mutationTargetIndexes.has(imported) || imported === "open") {
        aliases.set(element.name.text, imported);
      }
    }
  }
  return aliases;
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
  if (ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node)) {
    return expandedExpression(node.expression, declarations, seen);
  }
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

function fileHandleTarget(node, sourceFile) {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  if (!["write", "writeFile", "truncate"].includes(node.expression.name.text)) {
    return undefined;
  }
  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver)) return undefined;
  const declarations = declarationsVisibleFrom(node);
  const initializer = declarations.get(receiver.text);
  if (!initializer) return undefined;
  const opened = ts.isAwaitExpression(initializer) ? initializer.expression : initializer;
  if (!ts.isCallExpression(opened)) return undefined;
  const aliases = importedMutationAliases(sourceFile);
  const openName = calleeName(opened.expression);
  if (openName !== "open" && aliases.get(openName) !== "open") return undefined;
  return opened.arguments[0];
}

function mutationTarget(node, sourceFile, wrappers = new Map()) {
  if (!ts.isCallExpression(node)) return undefined;
  const aliases = importedMutationAliases(sourceFile);
  const localName = calleeName(node.expression);
  const importedName = importedNames(sourceFile).get(localName);
  const operation = aliases.get(localName) ?? importedName ?? localName;
  const wrapper = mutationTargetIndexes.has(operation)
    ? undefined
    : (wrappers.get(localName) ?? wrappers.get(importedName));
  if (wrapper && generatedTargetKind(wrapper.template)) return undefined;
  const handleTarget = fileHandleTarget(node, sourceFile);
  const targetIndex = mutationTargetIndexes.get(operation) ?? wrapper?.targetIndex;
  const target = handleTarget ?? node.arguments[targetIndex];
  if (!target) return undefined;
  const declarations = declarationsVisibleFrom(node);
  const expandedArgument = expandedExpression(target, declarations);
  return {
    targetNode: target,
    operation: handleTarget ? `handle.${calleeName(node.expression)}` : (wrapper?.operation ?? operation),
    expandedTarget: wrapper
      ? wrapper.template.replaceAll(wrapper.parameterName, `(${expandedArgument})`)
      : expandedArgument,
    guardedByWrapper: wrapper?.guarded ?? false,
    rootBoundByWrapper: wrapper?.rootBound ?? false,
    expandedRunId:
      operation === "atomicWriteGeneratedSiteFile" && node.arguments[0]
        ? expandedExpression(node.arguments[0], declarations)
        : undefined,
  };
}

function directMutationTargets(node, sourceFile, wrappers = new Map()) {
  if (!ts.isCallExpression(node)) return [];
  const aliases = importedMutationAliases(sourceFile);
  const localName = calleeName(node.expression);
  const importedName = importedNames(sourceFile).get(localName);
  const operation = aliases.get(localName) ?? importedName ?? localName;
  if (operation !== "rename") {
    const mutation = mutationTarget(node, sourceFile, wrappers);
    return mutation ? [mutation] : [];
  }
  const declarations = declarationsVisibleFrom(node);
  const [source, destination] = node.arguments;
  if (!source || !destination) return [];
  return [
    {
      operation: "rename-source-removal",
      expandedTarget: expandedExpression(source, declarations),
      guardedByWrapper: false,
    },
    {
      operation: "rename-destination-creation",
      expandedTarget: expandedExpression(destination, declarations),
      guardedByWrapper: false,
    },
  ];
}

const generatedArtifactProperties = new Set([
  "catalog",
  "gates",
  "history",
  "html",
  "index",
  "ledger",
  "manifest",
  "manifestScript",
  "site",
  "sourceTokens",
  "tokensCss",
]);

function generatedTargetKind(expandedTarget) {
  if (
    /candidatePaths\([^)]*\)/.test(expandedTarget) ||
    /createCandidateGateTarget\(/.test(expandedTarget) ||
    /\bsnapshot\.paths\.(?:gates|manifest|provenance|root|site)\b/.test(expandedTarget) ||
    /["'`]candidate(?:\.[A-Za-z0-9_-]+)?["'`]/.test(expandedTarget) ||
    /\.candidate(?:Root|Site|Manifest|Provenance|Gates)\b/.test(expandedTarget)
  ) {
    return "candidate";
  }
  if (
    /\.site-promotion-(?:stage|retired|demoted)-/.test(expandedTarget) ||
    /\b(?:leftovers|valid)\.promotion(?:Retired|Stage|Demoted)\b/.test(expandedTarget)
  ) {
    return "promotion";
  }
  if (/\bvalid\[\d+\]\.root\b/.test(expandedTarget)) return "candidate";
  if (
    (/["'`](?:gates|element-history|token-history|motion-history|tokens|image-library|image-generation-ledger)\.json["'`]/.test(
      expandedTarget,
    ) && /\b(?:runRoot|files\.root|target\.runRoot|sitePaths|libraryPaths|editorPaths|motionPaths)\b/.test(expandedTarget)) ||
    (/["'`]motion-manifest\.js["'`]/.test(expandedTarget) &&
      /\b(?:runRoot|files\.root|sitePaths|motionPaths)\b/.test(expandedTarget)) ||
    /\b(?:runRoot|target\.runRoot)\b[^\n]*\bARTIFACTS\.gates\b/.test(expandedTarget) ||
    /\b(?:files|roots|paths|target|libraryPaths\([^)]*\)|sitePaths\([^)]*\))\.(catalog|gates|history|html|index|ledger|manifest|manifestScript|site|sourceTokens|tokensCss)\b/.test(
      expandedTarget,
    ) ||
    /path\.join\([^)]*,\s*["'`]site["'`](?:\s*,|\s*\))/.test(expandedTarget)
  ) {
    return "live";
  }
  const propertyMatch =
    expandedTarget.match(/\.([A-Za-z][A-Za-z0-9]*)(?![-A-Za-z0-9_])/g) ?? [];
  if (
    propertyMatch.some((property) =>
      generatedArtifactProperties.has(property.slice(1))
    ) &&
    /(?:sitePaths|editorPaths|motionPaths|libraryPaths)\(/.test(expandedTarget)
  ) {
    return "live";
  }
  return undefined;
}

function insideGuardedMutation(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const call = current.parent;
      if (ts.isCallExpression(call)) {
        const localName = calleeName(call.expression);
        const name =
          importedNames(current.getSourceFile()).get(localName) ?? localName;
        const argumentIndex = call.arguments.indexOf(current);
        if (
          (name === "withSiteAuthorityLock" && argumentIndex === 1) ||
          (name === "withImageAuthority" && argumentIndex === 2)
        ) {
          return true;
        }
      }
    }
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

function propertyInitializer(object, name) {
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  for (const property of object.properties) {
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === name
    ) {
      return property.name;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    if (property.name.getText().replace(/["']/g, "") === name) {
      return property.initializer;
    }
  }
  return undefined;
}

function staticPropertyName(property) {
  if (!property.name) return undefined;
  const name = property.name;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(unwrapProvenanceNode(name.expression))
  ) {
    return unwrapProvenanceNode(name.expression).text;
  }
  return undefined;
}

function stablePropertyInitializer(object, name) {
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  let initializer;
  let found = false;
  for (const property of object.properties) {
    if (found) {
      if (ts.isSpreadAssignment(property)) return undefined;
      const laterName = staticPropertyName(property);
      if (laterName === undefined || laterName === name) return undefined;
      continue;
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === name
    ) {
      initializer = property.name;
      found = true;
    } else if (
      ts.isPropertyAssignment(property) &&
      staticPropertyName(property) === name
    ) {
      initializer = property.initializer;
      found = true;
    }
  }
  return initializer;
}

function normalizedExpression(expression) {
  let normalized = expression.replace(/\s+/g, "").trim();
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(
      /(^|[^A-Za-z0-9_$])\(([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\)/g,
      "$1$2",
    );
  } while (normalized !== previous);
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function artifactFamily(expression) {
  return normalizedExpression(expression).replace(
    /\.(?:catalog|gates|history|html|index|ledger|manifest|manifestScript|root|site|sourceTokens|tokensCss)$/,
    "",
  );
}

function helperCallArguments(expression, helper) {
  const source = normalizedExpression(expression);
  const start = source.indexOf(`${helper}(`);
  if (start < 0) return [];
  const argumentsStart = start + helper.length + 1;
  const argumentsFound = [];
  let current = "";
  let depth = 1;
  let quote;
  let escaped = false;
  for (let index = argumentsStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (["\"", "'", "`"].includes(character)) {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      current += character;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        argumentsFound.push(current);
        return argumentsFound;
      }
      current += character;
      continue;
    }
    if (character === "," && depth === 1) {
      argumentsFound.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  return [];
}

function targetMatchesRoot(expandedTarget, expandedRoot) {
  const normalizedTarget = normalizedExpression(expandedTarget);
  const normalizedRoot = normalizedExpression(expandedRoot);
  const targetFamily = artifactFamily(expandedTarget);
  const rootFamily = artifactFamily(expandedRoot);
  return (
    targetFamily === rootFamily ||
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}.`) ||
    normalizedTarget.startsWith(`path.join(${normalizedRoot},`) ||
    normalizedTarget.startsWith(`path.resolve(${normalizedRoot},`)
  );
}

function targetCarriesGeneratedRoot(expandedTarget) {
  return (
    /\b(?:sitePaths|candidatePaths|editorPaths|motionPaths|libraryPaths)\(/.test(expandedTarget) ||
    /\brunRoot\b/.test(expandedTarget) ||
    /\b(?:leftovers\.promotion(?:Retired|Stage|Demoted)|valid\[\d+\]\.root)\b/.test(
      expandedTarget,
    )
  );
}

function targetMatchesCanonicalRun(expandedTarget, expandedRunId) {
  return [
    "sitePaths",
    "candidatePaths",
    "candidateLeftovers",
    "createLiveGateTarget",
    "editorPaths",
    "motionPaths",
    "libraryPaths",
  ].some(
    (helper) => {
      const normalizedRunId = normalizedExpression(expandedRunId);
      return helperCallArguments(expandedTarget, helper).some(
        (argument) => normalizedExpression(argument) === normalizedRunId,
      );
    },
  );
}

function directAuthorityBinding(node, expandedTarget) {
  const declarations = declarationsVisibleFrom(node);
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const call = current.parent;
      if (!ts.isCallExpression(call)) continue;
      const localName = calleeName(call.expression);
      const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
      const argumentIndex = call.arguments.indexOf(current);
      if (name === "withSiteAuthorityLock" && argumentIndex === 1) {
        const runId = call.arguments[0];
        const options = call.arguments[2];
        if (options) {
          const runRoot = stablePropertyInitializer(options, "runRoot");
          return Boolean(
            runRoot &&
              targetMatchesRoot(
                expandedTarget,
                expandedExpression(runRoot, declarations),
              ),
          );
        }
        return Boolean(
          runId &&
            targetMatchesCanonicalRun(
              expandedTarget,
              expandedExpression(runId, declarations),
            ),
        );
      }
      if (name === "withImageAuthority" && argumentIndex === 2) {
        const files = call.arguments[1];
        return Boolean(
          files &&
            targetMatchesRoot(
              expandedTarget,
              `${expandedExpression(files, declarations)}.root`,
            ),
        );
      }
    }
    if (!ts.isPropertyAssignment(current)) continue;
    const property = current.name.getText().replace(/["']/g, "");
    if (property !== "mutate" && property !== "commit") continue;
    const object = current.parent;
    const call = object.parent;
    if (
      !ts.isObjectLiteralExpression(object) ||
      !ts.isCallExpression(call) ||
      calleeName(call.expression) !== "runGuardedMutation"
    ) {
      continue;
    }
    const runRoot = stablePropertyInitializer(object, "runRoot");
    return Boolean(
      runRoot &&
        targetMatchesRoot(
          expandedTarget,
          expandedExpression(runRoot, declarations),
        ),
    );
  }
  return false;
}

function directAuthorityRunBinding(node, expandedRunId) {
  if (!expandedRunId) return false;
  const declarations = declarationsVisibleFrom(node);
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const call = current.parent;
      if (!ts.isCallExpression(call)) continue;
      const localName = calleeName(call.expression);
      const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
      const argumentIndex = call.arguments.indexOf(current);
      const authorityRun = call.arguments[0];
      if (
        authorityRun &&
        ((name === "withSiteAuthorityLock" && argumentIndex === 1) ||
          (name === "withImageAuthority" && argumentIndex === 2)) &&
        normalizedExpression(expandedRunId) ===
          normalizedExpression(expandedExpression(authorityRun, declarations))
      ) {
        return true;
      }
    }
    if (!ts.isPropertyAssignment(current)) continue;
    const property = current.name.getText().replace(/["']/g, "");
    if (property !== "mutate" && property !== "commit") continue;
    const object = current.parent;
    const call = object.parent;
    if (
      !ts.isObjectLiteralExpression(object) ||
      !ts.isCallExpression(call) ||
      calleeName(call.expression) !== "runGuardedMutation"
    ) {
      continue;
    }
    const authorityRun = stablePropertyInitializer(object, "runId");
    if (
      authorityRun &&
      normalizedExpression(expandedRunId) ===
        normalizedExpression(expandedExpression(authorityRun, declarations))
    ) {
      return true;
    }
  }
  return false;
}

function directCanonicalRunBinding(node, expandedTarget) {
  const declarations = declarationsVisibleFrom(node);
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    const call = current.parent;
    if (!ts.isCallExpression(call)) continue;
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    if (
      name !== "withSiteAuthorityLock" ||
      call.arguments.indexOf(current) !== 1
    ) {
      continue;
    }
    const options = call.arguments[2];
    if (options && !stablePropertyInitializer(options, "runRoot")) {
      return false;
    }
    const runId = call.arguments[0];
    return Boolean(
      runId &&
        targetMatchesCanonicalRun(
          expandedTarget,
          expandedExpression(runId, declarations),
        ),
    );
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

function mutationWrapperSummaries(sources) {
  const authorityControls = new Set([
    "runGuardedMutation",
    "withFileLock",
    "withGeneratedSiteMutationAuthority",
    "withImageAuthority",
    "withSiteAuthorityLock",
  ]);
  const wrappers = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { sourceFile } of sources) {
      const visit = (node) => {
        const definition = namedFunction(node);
        if (
          !definition ||
          authorityControls.has(definition.name) ||
          wrappers.has(definition.name)
        ) {
          ts.forEachChild(node, visit);
          return;
        }
        const candidates = [];
        const visitBody = (current) => {
          if (
            current !== definition.node &&
            (ts.isFunctionDeclaration(current) ||
              ts.isMethodDeclaration(current) ||
              ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
                ts.isVariableDeclaration(current.parent)))
          ) {
            return;
          }
          const mutation = mutationTarget(current, sourceFile, wrappers);
          if (mutation) {
            definition.node.parameters.forEach((parameter, index) => {
              if (!ts.isIdentifier(parameter.name)) return;
              const parameterPattern = new RegExp(`\\b${parameter.name.text}\\b`);
              if (parameterPattern.test(mutation.expandedTarget)) {
                candidates.push({
                  targetIndex: index,
                  parameterName: parameter.name.text,
                  template: mutation.expandedTarget,
                  operation: definition.name,
                  guarded:
                    mutation.guardedByWrapper || insideGuardedMutation(current),
                  rootBound:
                    mutation.rootBoundByWrapper ||
                    directAuthorityBinding(current, mutation.expandedTarget),
                });
              }
            });
          }
          ts.forEachChild(current, visitBody);
        };
        visitBody(definition.node.body);
        const indexes = new Set(candidates.map((candidate) => candidate.targetIndex));
        if (indexes.size === 1 && candidates.length > 0) {
          wrappers.set(definition.name, candidates[0]);
          changed = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return wrappers;
}

function guardedCallbackWrappers(sources) {
  const definitions = new Map();
  for (const { sourceFile } of sources) {
    const visit = (node) => {
      const definition = namedFunction(node);
      if (definition) {
        const guardedParameterIndexes = new Set();
        const authorityRunParameterIndexes = new Set();
        const authorityRoots = [];
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
        const visitAuthorityRun = (current) => {
          if (
            ts.isCallExpression(current) &&
            calleeName(current.expression) === "runGuardedMutation" &&
            current.arguments[0] &&
            ts.isObjectLiteralExpression(current.arguments[0])
          ) {
            const runId = stablePropertyInitializer(current.arguments[0], "runId");
            const runRoot = stablePropertyInitializer(current.arguments[0], "runRoot");
            if (runRoot) authorityRoots.push(runRoot);
            if (runId) {
              const expandedRunId = expandedExpression(
                runId,
                declarationsVisibleFrom(current),
              );
              definition.node.parameters.forEach((parameter, index) => {
                if (
                  ts.isIdentifier(parameter.name) &&
                  new RegExp(`\\b${parameter.name.text}\\b`).test(expandedRunId)
                ) {
                  authorityRunParameterIndexes.add(index);
                }
              });
            }
          }
          ts.forEachChild(current, visitAuthorityRun);
        };
        visitAuthorityRun(definition.node.body);
        const existing = definitions.get(definition.name) ?? [];
        existing.push({
          definition: definition.node,
          guardedParameterIndexes,
          authorityRoot:
            authorityRoots.length === 1 ? authorityRoots[0] : undefined,
          runParameterIndex:
            authorityRunParameterIndexes.size === 1
              ? [...authorityRunParameterIndexes][0]
              : undefined,
        });
        definitions.set(definition.name, existing);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const wrappers = new Map();
  for (const [name, candidates] of definitions) {
    if (candidates.length === 1 && candidates[0].guardedParameterIndexes.size > 0) {
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
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    if (wrappers.get(name)?.guardedParameterIndexes.has(argumentIndex)) {
      return true;
    }
  }
  return false;
}

function guardedWrapperRunBinding(node, expandedRunId, wrappers) {
  if (!expandedRunId) return false;
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    const call = current.parent;
    if (!ts.isCallExpression(call)) continue;
    const callbackIndex = call.arguments.indexOf(current);
    if (callbackIndex < 0) continue;
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    const wrapper = wrappers.get(name);
    const authorityRun = wrapper?.runParameterIndex === undefined
      ? undefined
      : call.arguments[wrapper.runParameterIndex];
    if (
      wrapper?.guardedParameterIndexes.has(callbackIndex) &&
      authorityRun &&
      normalizedExpression(expandedRunId) ===
        normalizedExpression(
          expandedExpression(authorityRun, declarationsVisibleFrom(call)),
        )
    ) {
      return true;
    }
  }
  return false;
}

function primitiveProvenanceAnalysis(sources) {
  const definitions = new Map();
  const namesByDefinition = new Map();
  const callsites = new Map();
  for (const { sourceFile } of sources) {
    const visit = (node) => {
      const definition = namedFunction(node);
      if (definition) {
        const existing = definitions.get(definition.name) ?? [];
        existing.push(definition.node);
        definitions.set(definition.name, existing);
        namesByDefinition.set(definition.node, definition.name);
      }
      if (ts.isCallExpression(node)) {
        const localName = calleeName(node.expression);
        const name = importedNames(sourceFile).get(localName) ?? localName;
        if (name) {
          const existing = callsites.get(name) ?? [];
          existing.push(node);
          callsites.set(name, existing);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return {
    callsites,
    definitions,
    namesByDefinition,
  };
}

function unwrapProvenanceNode(node) {
  let current = node;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function parameterDeclaration(node) {
  if (!ts.isIdentifier(node)) return undefined;
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parameter = current.parameters.find(
      (parameter) =>
        ts.isIdentifier(parameter.name) && parameter.name.text === node.text,
    );
    if (parameter) return parameter;
  }
  return undefined;
}

function objectLiteralReference(reference, depth = 0) {
  if (depth > 16) return undefined;
  const node = unwrapProvenanceNode(reference.node);
  if (ts.isObjectLiteralExpression(node)) return { ...reference, node };
  if (!ts.isIdentifier(node)) return undefined;
  const parameter = parameterDeclaration(node);
  const bound = parameter && reference.bindings.get(parameter);
  if (bound) return objectLiteralReference(bound, depth + 1);
  const initializer = declarationsVisibleFrom(node).get(node.text);
  return initializer
    ? objectLiteralReference(
        { node: initializer, bindings: reference.bindings },
        depth + 1,
      )
    : undefined;
}

function expandProvenanceExpression(reference, depth = 0) {
  if (depth > 24) return reference.node.getText();
  const node = unwrapProvenanceNode(reference.node);
  if (ts.isIdentifier(node)) {
    const parameter = parameterDeclaration(node);
    const bound = parameter && reference.bindings.get(parameter);
    if (bound) return expandProvenanceExpression(bound, depth + 1);
    const initializer = declarationsVisibleFrom(node).get(node.text);
    return initializer
      ? expandProvenanceExpression(
          { node: initializer, bindings: reference.bindings },
          depth + 1,
        )
      : node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const object = objectLiteralReference(
      { node: node.expression, bindings: reference.bindings },
    );
    if (object) {
      const initializer = propertyInitializer(object.node, node.name.text);
      return initializer
        ? expandProvenanceExpression(
            { node: initializer, bindings: object.bindings },
            depth + 1,
          )
        : "undefined";
    }
    return `${expandProvenanceExpression(
      { node: node.expression, bindings: reference.bindings },
      depth + 1,
    )}.${node.name.text}`;
  }
  if (ts.isCallExpression(node)) {
    return `${expandProvenanceExpression(
      { node: node.expression, bindings: reference.bindings },
      depth + 1,
    )}(${node.arguments
      .map((argument) =>
        expandProvenanceExpression(
          { node: argument, bindings: reference.bindings },
          depth + 1,
        ),
      )
      .join(",")})`;
  }
  if (ts.isTemplateExpression(node)) {
    return `${JSON.stringify(node.head.text)}${node.templateSpans
      .map(
        (span) =>
          `+${expandProvenanceExpression(
            { node: span.expression, bindings: reference.bindings },
            depth + 1,
          )}+${JSON.stringify(span.literal.text)}`,
      )
      .join("")}`;
  }
  if (ts.isStringLiteralLike(node)) return JSON.stringify(node.text);
  return node.getText();
}

function rootDescriptorFromParts(runId, sitesRoot) {
  const run = normalizedExpression(runId);
  const root = normalizedExpression(sitesRoot ?? "undefined");
  if (!sitesRoot || root === "undefined" || root === "void0") {
    return `canonical:${run}`;
  }
  const dirname = root.match(/^path\.dirname\((.+)\)$/);
  if (dirname) {
    const parentDescriptor = rootDescriptorFromExpression(dirname[1]);
    const parentRun = parentDescriptor?.split(":").at(-1);
    if (parentDescriptor && parentRun === run) return parentDescriptor;
  }
  return `custom:${root}:${run}`;
}

function rootDescriptorFromExpression(expression) {
  const normalized = normalizedExpression(expression);
  for (const helper of ["libraryPaths", "editorPaths"]) {
    const args = helperCallArguments(normalized, helper);
    if (args.length > 0) return rootDescriptorFromParts(args[0], args[1]);
  }
  const siteArgs = helperCallArguments(normalized, "sitePaths");
  if (siteArgs.length > 0) return rootDescriptorFromParts(siteArgs[0]);
  return normalized ? `expression:${artifactFamily(normalized)}` : undefined;
}

function importsCanonicalSitePaths(sourceFile, localName) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return false;
    }
    const specifier = statement.moduleSpecifier.text;
    const resolved = specifier.startsWith("@/")
      ? path.resolve(repository, "src", specifier.slice(2))
      : specifier.startsWith(".")
        ? path.resolve(path.dirname(sourceFile.fileName), specifier)
        : undefined;
    if (
      !resolved ||
      resolved.replace(/\.tsx?$/, "") !==
        path.resolve(repository, "src/lib/runstate")
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return Boolean(
      bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some(
          (element) =>
            element.name.text === localName &&
            (element.propertyName?.text ?? element.name.text) === "sitePaths",
        ),
    );
  });
}

function importsNodeModuleObject(sourceFile, localName, moduleNames) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !moduleNames.includes(statement.moduleSpecifier.text)
    ) {
      return false;
    }
    if (statement.importClause?.name?.text === localName) return true;
    const bindings = statement.importClause?.namedBindings;
    return Boolean(
      bindings &&
        ts.isNamespaceImport(bindings) &&
        bindings.name.text === localName,
    );
  });
}

function bindingDeclaresName(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name;
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) {
    return binding.elements.some(
      (element) =>
        ts.isBindingElement(element) && bindingDeclaresName(element.name, name),
    );
  }
  return false;
}

function sourceHasNonImportBinding(sourceFile, name) {
  let found = false;
  const visit = (node) => {
    if (found || ts.isImportDeclaration(node)) return;
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      bindingDeclaresName(node.name, name)
    ) {
      found = true;
      return;
    }
    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration &&
      bindingDeclaresName(node.variableDeclaration.name, name)
    ) {
      found = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isImportEqualsDeclaration(node)) &&
      node.name?.text === name
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function resolvesToNodeModuleObject(identifier, moduleNames) {
  return (
    !sourceHasNonImportBinding(identifier.getSourceFile(), identifier.text) &&
    importsNodeModuleObject(
      identifier.getSourceFile(),
      identifier.text,
      moduleNames,
    )
  );
}

function resolvesToCanonicalSitePaths(identifier) {
  return (
    !sourceHasNonImportBinding(identifier.getSourceFile(), identifier.text) &&
    importsCanonicalSitePaths(identifier.getSourceFile(), identifier.text)
  );
}

function safeRelativePathText(value, segmentOnly = false) {
  const parts = value.split(/[\\/]+/);
  return (
    !path.isAbsolute(value) &&
    !parts.includes("..") &&
    (!segmentOnly || parts.length === 1)
  );
}

function containsThrowStatement(node) {
  let found = false;
  const visit = (current) => {
    if (found || (current !== node && ts.isFunctionLike(current))) return;
    if (ts.isThrowStatement(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function singleSegmentValidatorHasCanonicalShape(definition) {
  if (
    definition.parameters.length !== 1 ||
    !ts.isIdentifier(definition.parameters[0].name) ||
    !ts.isBlock(definition.body)
  ) {
    return false;
  }
  const parameter = definition.parameters[0].name;
  let safeRegex;
  for (const statement of definition.getSourceFile().statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isRegularExpressionLiteral(declaration.initializer) &&
        declaration.initializer.getText() ===
          "/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i"
      ) {
        safeRegex = declaration.name.text;
      }
    }
  }
  if (!safeRegex) return false;
  return definition.body.statements.some((statement) => {
    if (!ts.isIfStatement(statement) || !containsThrowStatement(statement.thenStatement)) {
      return false;
    }
    const condition = unwrapProvenanceNode(statement.expression);
    if (
      !ts.isPrefixUnaryExpression(condition) ||
      condition.operator !== ts.SyntaxKind.ExclamationToken
    ) {
      return false;
    }
    const test = unwrapProvenanceNode(condition.operand);
    return (
      ts.isCallExpression(test) &&
      ts.isPropertyAccessExpression(test.expression) &&
      ts.isIdentifier(test.expression.expression) &&
      test.expression.expression.text === safeRegex &&
      test.expression.name.text === "test" &&
      test.arguments.length === 1 &&
      ts.isIdentifier(unwrapProvenanceNode(test.arguments[0])) &&
      unwrapProvenanceNode(test.arguments[0]).text === parameter.text
    );
  });
}

function enclosingFunctionLike(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
}

function hasPriorSingleSegmentAssertion(node, analysis) {
  const owner = enclosingFunctionLike(node);
  if (!owner || !ts.isBlock(owner.body)) return false;
  const expected = normalizedExpression(node.getText());
  let asserted = false;
  const visit = (current) => {
    if (
      asserted ||
      current.getStart() >= node.getStart() ||
      (current !== owner.body && ts.isFunctionLike(current))
    ) {
      return;
    }
    if (ts.isCallExpression(current) && current.arguments.length === 1) {
      const localName = calleeName(current.expression);
      const importedName =
        importedNames(current.getSourceFile()).get(localName) ?? localName;
      const definitions = importedName
        ? analysis.definitions.get(importedName) ?? []
        : [];
      if (
        definitions.length === 1 &&
        singleSegmentValidatorHasCanonicalShape(definitions[0]) &&
        normalizedExpression(current.arguments[0].getText()) === expected
      ) {
        asserted = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(owner.body);
  return asserted;
}

function flattenedOrConditions(expression) {
  const node = unwrapProvenanceNode(expression);
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    return [
      ...flattenedOrConditions(node.left),
      ...flattenedOrConditions(node.right),
    ];
  }
  return [node];
}

function isPathSeparatorExpression(expression) {
  const node = unwrapProvenanceNode(expression);
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "sep" &&
    ts.isIdentifier(node.expression) &&
    resolvesToNodeModuleObject(node.expression, ["node:path"])
  );
}

function isDotDotPrefix(expression) {
  const node = unwrapProvenanceNode(expression);
  return (
    ts.isTemplateExpression(node) &&
    node.head.text === ".." &&
    node.templateSpans.length === 1 &&
    isPathSeparatorExpression(node.templateSpans[0].expression) &&
    node.templateSpans[0].literal.text === ""
  );
}

function hasPriorRelativePathGuard(identifier) {
  const owner = enclosingFunctionLike(identifier);
  if (!owner || !ts.isBlock(owner.body)) return false;
  for (const statement of owner.body.statements) {
    if (
      statement.getStart() >= identifier.getStart() ||
      !ts.isIfStatement(statement) ||
      !containsThrowStatement(statement.thenStatement)
    ) {
      continue;
    }
    let rejectsDotDot = false;
    let rejectsDotDotPrefix = false;
    let rejectsAbsolute = false;
    for (const condition of flattenedOrConditions(statement.expression)) {
      if (
        ts.isBinaryExpression(condition) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
        ].includes(condition.operatorToken.kind)
      ) {
        const left = unwrapProvenanceNode(condition.left);
        const right = unwrapProvenanceNode(condition.right);
        rejectsDotDot ||=
          (ts.isIdentifier(left) &&
            left.text === identifier.text &&
            ts.isStringLiteralLike(right) &&
            right.text === "..") ||
          (ts.isIdentifier(right) &&
            right.text === identifier.text &&
            ts.isStringLiteralLike(left) &&
            left.text === "..");
      }
      if (!ts.isCallExpression(condition)) continue;
      if (
        ts.isPropertyAccessExpression(condition.expression) &&
        ts.isIdentifier(condition.expression.expression) &&
        condition.expression.expression.text === identifier.text &&
        condition.expression.name.text === "startsWith" &&
        condition.arguments.length === 1 &&
        isDotDotPrefix(condition.arguments[0])
      ) {
        rejectsDotDotPrefix = true;
      }
      if (
        ts.isPropertyAccessExpression(condition.expression) &&
        condition.expression.name.text === "isAbsolute" &&
        ts.isIdentifier(condition.expression.expression) &&
        resolvesToNodeModuleObject(condition.expression.expression, ["node:path"]) &&
        condition.arguments.length === 1 &&
        ts.isIdentifier(unwrapProvenanceNode(condition.arguments[0])) &&
        unwrapProvenanceNode(condition.arguments[0]).text === identifier.text
      ) {
        rejectsAbsolute = true;
      }
    }
    if (rejectsDotDot && rejectsDotDotPrefix && rejectsAbsolute) return true;
  }
  return false;
}

function forOfIterable(identifier) {
  for (let current = identifier.parent; current; current = current.parent) {
    if (!ts.isForOfStatement(current)) continue;
    const initializer = current.initializer;
    if (!ts.isVariableDeclarationList(initializer)) continue;
    if (
      initializer.declarations.some((declaration) =>
        bindingDeclaresName(declaration.name, identifier.text),
      )
    ) {
      return current.expression;
    }
  }
  return undefined;
}

function isMinusOne(expression) {
  const node = unwrapProvenanceNode(expression);
  return (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand) &&
    node.operand.text === "1"
  );
}

function staticallyBoundedSegmentSequence(
  expression,
  reference,
  analysis,
  depth = 0,
  visiting = new Set(),
) {
  if (depth > 16) return false;
  const node = unwrapProvenanceNode(expression);
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every(
      (element) =>
        ts.isStringLiteralLike(unwrapProvenanceNode(element)) &&
        safeRelativePathText(unwrapProvenanceNode(element).text, true),
    );
  }
  if (ts.isIdentifier(node)) {
    const key = `${node.getSourceFile().fileName}:${node.getStart()}:sequence`;
    if (visiting.has(key)) return false;
    const parameter = parameterDeclaration(node);
    const bound = parameter && reference.bindings.get(parameter);
    const initializer = declarationsVisibleFrom(node).get(node.text);
    const origin = bound ??
      (initializer ? { node: initializer, bindings: reference.bindings } : undefined);
    return Boolean(
      origin &&
        staticallyBoundedSegmentSequence(
          origin.node,
          origin,
          analysis,
          depth + 1,
          new Set([...visiting, key]),
        ),
    );
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  if (node.expression.name.text === "slice") {
    return staticallyBoundedSegmentSequence(
      node.expression.expression,
      reference,
      analysis,
      depth + 1,
      visiting,
    );
  }
  return (
    node.expression.name.text === "split" &&
    ts.isIdentifier(unwrapProvenanceNode(node.expression.expression)) &&
    hasPriorRelativePathGuard(unwrapProvenanceNode(node.expression.expression)) &&
    node.arguments.length === 1 &&
    isPathSeparatorExpression(node.arguments[0])
  );
}

function staticStringValues(
  reference,
  chain,
  analysis,
  depth = 0,
  visiting = new Set(),
) {
  if (depth > 24) return undefined;
  const node = unwrapProvenanceNode(reference.node);
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(node) && node.text === "undefined")
  ) {
    return new Set();
  }
  if (ts.isStringLiteralLike(node)) {
    return chain.length === 0 ? new Set([node.text]) : undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return staticStringValues(
      { node: node.expression, bindings: reference.bindings },
      [node.name.text, ...chain],
      analysis,
      depth + 1,
      visiting,
    );
  }
  if (ts.isIdentifier(node)) {
    const key = `${node.getSourceFile().fileName}:${node.getStart()}:${node.text}:${chain.join(".")}`;
    if (visiting.has(key)) return new Set();
    const origins = identifierOrigins(reference, analysis, chain);
    if (!origins || origins.length === 0) return undefined;
    const nextVisiting = new Set([...visiting, key]);
    const branches = origins.map((origin) =>
      staticStringValues(
        origin,
        [...(origin.projectedProperties ?? []), ...chain],
        analysis,
        depth + 1,
        nextVisiting,
      ),
    );
    if (branches.some((branch) => branch === undefined)) return undefined;
    return new Set(branches.flatMap((branch) => [...branch]));
  }
  if (ts.isObjectLiteralExpression(node)) {
    if (chain.length === 0) return undefined;
    const initializer = stablePropertyInitializer(node, chain[0]);
    if (!initializer) return undefined;
    return staticStringValues(
      { node: initializer, bindings: reference.bindings },
      chain.slice(1),
      analysis,
      depth + 1,
      visiting,
    );
  }
  if (ts.isConditionalExpression(node)) {
    const branches = [node.whenTrue, node.whenFalse].map((branch) =>
      staticStringValues(
        { node: branch, bindings: reference.bindings },
        chain,
        analysis,
        depth + 1,
        visiting,
      ),
    );
    if (branches.some((branch) => branch === undefined)) return undefined;
    return new Set(branches.flatMap((branch) => [...branch]));
  }
  if (!ts.isCallExpression(node)) return undefined;
  const returns = callReturnReferences(node, reference, analysis);
  if (!returns) return undefined;
  const branches = returns.map((returned) =>
    staticStringValues(returned, chain, analysis, depth + 1, visiting),
  );
  if (branches.some((branch) => branch === undefined)) return undefined;
  return new Set(branches.flatMap((branch) => [...branch]));
}

function staticallyBoundedPathArgument(
  argument,
  reference,
  analysis,
  segmentOnly = false,
  depth = 0,
  visiting = new Set(),
) {
  if (depth > 24) return false;
  const node = unwrapProvenanceNode(argument);
  if (ts.isStringLiteralLike(node)) {
    return safeRelativePathText(node.text, segmentOnly);
  }
  if (ts.isTemplateExpression(node)) {
    const staticParts = [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ];
    return (
      staticParts.every((part) => safeRelativePathText(part, segmentOnly)) &&
      node.templateSpans.every((span) =>
        staticallyBoundedPathArgument(
          span.expression,
          reference,
          analysis,
          true,
          depth + 1,
          visiting,
        ),
      )
    );
  }
  if (hasPriorSingleSegmentAssertion(node, analysis)) return true;
  if (ts.isIdentifier(node)) {
    const key = `${node.getSourceFile().fileName}:${node.getStart()}:${node.text}:${segmentOnly}`;
    if (visiting.has(key)) return false;
    const iterable = forOfIterable(node);
    if (
      iterable &&
      staticallyBoundedSegmentSequence(
        iterable,
        reference,
        analysis,
        depth + 1,
        visiting,
      )
    ) {
      return true;
    }
    const parameter = parameterDeclaration(node);
    const bound = parameter && reference.bindings.get(parameter);
    const initializer = declarationsVisibleFrom(node).get(node.text);
    const origin = bound ??
      (initializer ? { node: initializer, bindings: reference.bindings } : undefined);
    return Boolean(
      origin &&
        staticallyBoundedPathArgument(
          origin.node,
          origin,
          analysis,
          segmentOnly,
          depth + 1,
          new Set([...visiting, key]),
        ),
    );
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "at" &&
    node.arguments.length === 1 &&
    isMinusOne(node.arguments[0]) &&
    staticallyBoundedSegmentSequence(
      node.expression.expression,
      reference,
      analysis,
      depth + 1,
      visiting,
    )
  ) {
    return true;
  }
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse].every((branch) =>
      staticallyBoundedPathArgument(
        branch,
        reference,
        analysis,
        segmentOnly,
        depth + 1,
        visiting,
      ),
    );
  }
  if (ts.isPropertyAccessExpression(node)) {
    const values = staticStringValues(
      { node, bindings: reference.bindings },
      [],
      analysis,
    );
    return Boolean(
      values &&
        values.size > 0 &&
        [...values].every((value) => safeRelativePathText(value, segmentOnly)),
    );
  }
  return false;
}

function canonicalPathOperation(call, reference, analysis) {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression)
  ) {
    return undefined;
  }
  const operation = call.expression.name.text;
  if (
    ["dirname", "join", "resolve"].includes(operation) &&
    resolvesToNodeModuleObject(call.expression.expression, ["node:path"])
  ) {
    if (
      ["join", "resolve"].includes(operation) &&
      call.arguments.slice(1).some(
        (argument) =>
          !staticallyBoundedPathArgument(argument, reference, analysis),
      )
    ) {
      return undefined;
    }
    return operation;
  }
  if (
    operation === "realpath" &&
    resolvesToNodeModuleObject(call.expression.expression, [
      "node:fs",
      "node:fs/promises",
    ])
  ) {
    return operation;
  }
  return undefined;
}

function libraryPathHelperHasCanonicalShape(definition) {
  const [runId, sitesRoot] = definition.parameters;
  if (
    !runId ||
    !sitesRoot ||
    !ts.isIdentifier(runId.name) ||
    !ts.isIdentifier(sitesRoot.name)
  ) {
    return false;
  }
  const returns = [];
  const visit = (node) => {
    if (node !== definition && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(unwrapProvenanceNode(node.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (!ts.isBlock(definition.body)) return false;
  if (
    !importsNodeModuleObject(definition.getSourceFile(), "path", ["node:path"])
  ) {
    return false;
  }
  visit(definition.body);
  if (returns.length !== 1 || !ts.isObjectLiteralExpression(returns[0])) {
    return false;
  }
  if (returns[0].properties.some((property) => ts.isSpreadAssignment(property))) {
    return false;
  }
  const returnedNames = returns[0].properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    return [property.name.getText().replace(/["']/g, "")];
  });
  if (
    returnedNames.filter((name) => name === "root").length !== 1 ||
    returnedNames.filter((name) => name === "site").length !== 1
  ) {
    return false;
  }
  const root = propertyInitializer(returns[0], "root");
  const site = propertyInitializer(returns[0], "site");
  if (
    !root ||
    !site ||
    !ts.isPropertyAccessExpression(root) ||
    !ts.isPropertyAccessExpression(site) ||
    !ts.isIdentifier(root.expression) ||
    !ts.isIdentifier(site.expression) ||
    root.expression.text !== site.expression.text ||
    root.name.text !== "root" ||
    site.name.text !== "site"
  ) {
    return false;
  }
  const roots = declarationsVisibleFrom(root).get(root.expression.text);
  if (!roots || !ts.isConditionalExpression(roots)) return false;
  const condition = unwrapProvenanceNode(roots.condition);
  const custom = unwrapProvenanceNode(roots.whenTrue);
  const canonical = unwrapProvenanceNode(roots.whenFalse);
  if (
    !ts.isIdentifier(condition) ||
    condition.text !== sitesRoot.name.text ||
    !ts.isObjectLiteralExpression(custom) ||
    !ts.isCallExpression(canonical) ||
    calleeName(canonical.expression) !== "sitePaths" ||
    !importsCanonicalSitePaths(definition.getSourceFile(), "sitePaths") ||
    canonical.arguments[0]?.getText() !== runId.name.text
  ) {
    return false;
  }
  const customNames = custom.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    return [property.name.getText().replace(/["']/g, "")];
  });
  if (
    custom.properties.some((property) => ts.isSpreadAssignment(property)) ||
    customNames.length !== 2 ||
    new Set(customNames).size !== 2 ||
    !customNames.includes("root") ||
    !customNames.includes("site")
  ) {
    return false;
  }
  let rootsDeclarations = 0;
  let unsafeMutation = false;
  const protectedNames = new Set([
    root.expression.text,
    runId.name.text,
    sitesRoot.name.text,
  ]);
  const inspectMutation = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === root.expression.text
    ) {
      rootsDeclarations += 1;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "path"
    ) {
      unsafeMutation = true;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ((ts.isIdentifier(node.left) && protectedNames.has(node.left.text)) ||
        (ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === root.expression.text) ||
        (ts.isElementAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === root.expression.text))
    ) {
      unsafeMutation = true;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ["Object", "Reflect"].includes(node.expression.expression.text) &&
      node.arguments[0] &&
      ts.isIdentifier(unwrapProvenanceNode(node.arguments[0])) &&
      unwrapProvenanceNode(node.arguments[0]).text === root.expression.text
    ) {
      unsafeMutation = true;
    }
    ts.forEachChild(node, inspectMutation);
  };
  inspectMutation(definition.body);
  if (rootsDeclarations !== 1 || unsafeMutation) return false;
  return ["root", "site"].every((property) => {
    const initializer = propertyInitializer(custom, property);
    if (
      !initializer ||
      !ts.isCallExpression(initializer) ||
      !ts.isPropertyAccessExpression(initializer.expression) ||
      !ts.isIdentifier(initializer.expression.expression) ||
      initializer.expression.expression.text !== "path" ||
      !resolvesToNodeModuleObject(initializer.expression.expression, [
        "node:path",
      ]) ||
      initializer.expression.name.text !== "join" ||
      initializer.arguments[0]?.getText() !== sitesRoot.name.text ||
      initializer.arguments[1]?.getText() !== runId.name.text
    ) {
      return false;
    }
    if (property === "root") return initializer.arguments.length === 2;
    return (
      initializer.arguments.length === 3 &&
      ts.isStringLiteral(initializer.arguments[2]) &&
      initializer.arguments[2].text === "site"
    );
  });
}

function pathHelperRootDescriptor(call, chain, reference, analysis) {
  const localName = calleeName(call.expression);
  const importedName = importedNames(call.getSourceFile()).get(localName) ?? localName;
  const definitions = analysis.definitions.get(importedName) ?? [];
  const canonicalSitePaths =
    importedName === "sitePaths" &&
    ts.isIdentifier(call.expression) &&
    resolvesToCanonicalSitePaths(call.expression);
  const canonicalLibraryPaths =
    importedName === "libraryPaths" &&
    definitions.length === 1 &&
    libraryPathHelperHasCanonicalShape(definitions[0]);
  if (
    (!canonicalSitePaths && !canonicalLibraryPaths) ||
    chain.length !== 1 ||
    !new Set([...generatedArtifactProperties, "root"]).has(chain[0])
  ) {
    return undefined;
  }
  const expanded = (argument) =>
    argument
      ? expandProvenanceExpression({ node: argument, bindings: reference.bindings })
      : undefined;
  return rootDescriptorFromParts(
    expanded(call.arguments[0]),
    canonicalLibraryPaths ? expanded(call.arguments[1]) : undefined,
  );
}

function functionCallBindings(definition, call, callerBindings = new Map()) {
  const bindings = new Map();
  definition.parameters.forEach((parameter, index) => {
    const argument = call.arguments[index];
    bindings.set(parameter, {
      node:
        argument ??
        parameter.initializer ??
        ts.factory.createIdentifier("undefined"),
      bindings: callerBindings,
    });
  });
  return bindings;
}

function enclosingNamedDefinition(node) {
  for (let current = node.parent; current; current = current.parent) {
    const definition = namedFunction(current);
    if (definition) return definition.node;
  }
  return undefined;
}

function definitionBindingContexts(
  definition,
  analysis,
  visiting = new Set(),
) {
  const name = analysis.namesByDefinition.get(definition);
  if (!name || visiting.has(name)) return [new Map()];
  const calls = analysis.callsites.get(name) ?? [];
  if (calls.length === 0) return [new Map()];
  const nextVisiting = new Set([...visiting, name]);
  return calls.flatMap((call) => {
    const caller = enclosingNamedDefinition(call);
    const callerContexts = caller
      ? definitionBindingContexts(caller, analysis, nextVisiting)
      : [new Map()];
    return callerContexts.map((context) =>
      functionCallBindings(definition, call, context),
    );
  });
}

function callsiteBindingContexts(definition, call, analysis) {
  const caller = enclosingNamedDefinition(call);
  const callerContexts = caller
    ? definitionBindingContexts(caller, analysis)
    : [new Map()];
  return callerContexts.map((context) =>
    functionCallBindings(definition, call, context),
  );
}

function callReturnReferences(call, reference, analysis) {
  const localName = calleeName(call.expression);
  const name = importedNames(call.getSourceFile()).get(localName) ?? localName;
  const definitions = name ? analysis.definitions.get(name) ?? [] : [];
  if (definitions.length !== 1) return undefined;
  const definition = definitions[0];
  const bindings = functionCallBindings(
    definition,
    call,
    reference.bindings,
  );
  const returns = [];
  const visit = (node) => {
    if (node !== definition && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push({ node: node.expression, bindings });
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (ts.isBlock(definition.body)) visit(definition.body);
  else returns.push({ node: definition.body, bindings });
  return returns.length > 0 ? returns : undefined;
}

function staticPropertyPath(expression) {
  const node = unwrapProvenanceNode(expression);
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    const parent = staticPropertyPath(node.expression);
    return parent ? [...parent, node.name.text] : undefined;
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    const parent = staticPropertyPath(node.expression);
    return parent ? [...parent, node.argumentExpression.text] : undefined;
  }
  return undefined;
}

function staticRootIdentifier(expression) {
  const node = unwrapProvenanceNode(expression);
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return staticRootIdentifier(node.expression);
  }
  return undefined;
}

function samePropertyPath(left, right) {
  return Boolean(
    left &&
      right &&
      left.length === right.length &&
      left.every((part, index) => part === right[index]),
  );
}

function propertyPathStartsWith(pathParts, prefix) {
  return Boolean(
    pathParts &&
      prefix &&
      pathParts.length >= prefix.length &&
      prefix.every((part, index) => part === pathParts[index]),
  );
}

function identifierOrigins(reference, analysis, chain = []) {
  const node = unwrapProvenanceNode(reference.node);
  if (!ts.isIdentifier(node)) return undefined;
  const finalPathIndex = chain.indexOf("finalPath");
  const carrierPath = [
    node.text,
    ...chain.slice(0, finalPathIndex < 0 ? chain.length : finalPathIndex),
  ];
  const parameter = parameterDeclaration(node);
  let parameterOrigins;
  if (parameter) {
    const bound = reference.bindings.get(parameter);
    if (bound) {
      parameterOrigins = [bound];
    } else {
      const definition = parameter.parent;
      const name = analysis.namesByDefinition.get(definition);
      const definitions = name ? analysis.definitions.get(name) ?? [] : [];
      const index = definition.parameters.indexOf(parameter);
      if (!name || definitions.length !== 1 || index < 0) return undefined;
      const calls = analysis.callsites.get(name) ?? [];
      if (calls.length === 0) return undefined;
      parameterOrigins = calls.flatMap((call) =>
        call.arguments[index]
          ? [{ node: call.arguments[index], bindings: new Map() }]
          : [],
      );
      if (parameterOrigins.length === 0) return undefined;
    }
  }

  const aliases = new Set([node.text]);
  const visibleDeclarations = declarationsVisibleFrom(node);
  let aliasAdded;
  do {
    aliasAdded = false;
    for (const [name, initializer] of visibleDeclarations) {
      const value = unwrapProvenanceNode(initializer);
      if (
        ts.isIdentifier(value) &&
        aliases.has(value.text) &&
        !aliases.has(name)
      ) {
        aliases.add(name);
        aliasAdded = true;
      }
    }
  } while (aliasAdded);

  let propertyMutated = false;
  const origins = [];
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) continue;
    let declared = parameter?.parent === scope;
    if (declared) origins.push(...parameterOrigins);
    const useStart = node.getStart();
    const visit = (current) => {
      if (current !== scope && ts.isFunctionLike(current)) return;
      if (current.getSourceFile() === node.getSourceFile() && current.getStart() > useStart) {
        return;
      }
      if (ts.isVariableDeclaration(current)) {
        if (ts.isIdentifier(current.name) && current.name.text === node.text) {
          declared = true;
          if (current.initializer) {
            origins.push({ node: current.initializer, bindings: reference.bindings });
          }
        } else if (ts.isObjectBindingPattern(current.name)) {
          const element = current.name.elements.find(
            (element) =>
              ts.isIdentifier(element.name) && element.name.text === node.text,
          );
          if (element) {
            declared = true;
            if (current.initializer && !element.dotDotDotToken) {
              origins.push({
                node: current.initializer,
                bindings: reference.bindings,
                projectedProperties: [
                  element.propertyName?.getText().replace(/["']/g, "") ??
                    element.name.text,
                ],
              });
            }
          }
        }
      }
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(current.left) &&
        current.left.text === node.text
      ) {
        origins.push({ node: current.right, bindings: reference.bindings });
      }
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(current.left) &&
        ts.isIdentifier(unwrapProvenanceNode(current.right)) &&
        aliases.has(unwrapProvenanceNode(current.right).text)
      ) {
        aliases.add(current.left.text);
      }
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isPropertyAccessExpression(current.left) ||
          ts.isElementAccessExpression(current.left)) &&
        (propertyPathStartsWith(staticPropertyPath(current.left), carrierPath) ||
          (!staticPropertyPath(current.left) &&
            staticRootIdentifier(current.left) === carrierPath[0]) ||
          (ts.isIdentifier(current.left.expression) &&
            aliases.has(current.left.expression.text)))
      ) {
        propertyMutated = true;
      }
      if (ts.isCallExpression(current)) {
        const callee = ts.isPropertyAccessExpression(current.expression)
          ? current.expression
          : undefined;
        const receiver = callee?.expression;
        const knownMutator =
          receiver &&
          ts.isIdentifier(receiver) &&
          ((receiver.text === "Object" &&
            ["assign", "defineProperties", "defineProperty"].includes(
              callee.name.text,
            )) ||
            (receiver.text === "Reflect" &&
              ["defineProperty", "set"].includes(callee.name.text)));
        const firstArgument = current.arguments[0]
          ? unwrapProvenanceNode(current.arguments[0])
          : undefined;
        const firstArgumentPath = firstArgument
          ? staticPropertyPath(firstArgument)
          : undefined;
        const firstArgumentTouchesCarrier =
          samePropertyPath(firstArgumentPath, carrierPath) ||
          (!firstArgumentPath &&
            firstArgument &&
            staticRootIdentifier(firstArgument) === carrierPath[0]) ||
          (firstArgumentPath?.length === 1 && aliases.has(firstArgumentPath[0]));
        const receiverPath = receiver ? staticPropertyPath(receiver) : undefined;
        const directlyTouchesAlias =
          samePropertyPath(receiverPath, carrierPath) ||
          (!receiverPath &&
            receiver &&
            staticRootIdentifier(receiver) === carrierPath[0]) ||
          (receiverPath?.length === 1 && aliases.has(receiverPath[0])) ||
          current.arguments.some((argument) => {
            const argumentPath = staticPropertyPath(argument);
            return (
              samePropertyPath(argumentPath, carrierPath) ||
              (!argumentPath &&
                staticRootIdentifier(argument) === carrierPath[0]) ||
              (argumentPath?.length === 1 && aliases.has(argumentPath[0]))
            );
          });
        const callContainsReference =
          current.getSourceFile() === node.getSourceFile() &&
          current.getStart() <= node.getStart() &&
          current.getEnd() >= node.getEnd();
        if (
          (knownMutator &&
            firstArgumentTouchesCarrier) ||
          (chain.includes("finalPath") &&
            directlyTouchesAlias &&
            !callContainsReference)
        ) {
          propertyMutated = true;
        }
      }
      ts.forEachChild(current, visit);
    };
    visit(scope);
    if (declared) {
      return propertyMutated ? undefined : origins;
    }
  }
  return undefined;
}

function combinePrimitiveRoots(branches) {
  if (branches.some((branch) => branch === undefined)) return undefined;
  return new Set(branches.flatMap((branch) => [...branch]));
}

function primitiveTargetRoots(
  reference,
  chain,
  analysis,
  depth = 0,
  visitingIdentifiers = new Set(),
) {
  if (depth > 32) return undefined;
  const node = unwrapProvenanceNode(reference.node);
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(node) && node.text === "undefined")
  ) {
    return new Set();
  }
  if (ts.isPropertyAccessExpression(node)) {
    return primitiveTargetRoots(
      { node: node.expression, bindings: reference.bindings },
      [node.name.text, ...chain],
      analysis,
      depth + 1,
      visitingIdentifiers,
    );
  }
  if (ts.isIdentifier(node)) {
    const identifierKey = `${node.getSourceFile().fileName}:${node.getStart()}:${node.text}`;
    if (visitingIdentifiers.has(identifierKey)) return new Set();
    const origins = identifierOrigins(reference, analysis, chain);
    if (!origins || origins.length === 0) return undefined;
    const nextVisiting = new Set([...visitingIdentifiers, identifierKey]);
    return combinePrimitiveRoots(
      origins.map((origin) =>
        primitiveTargetRoots(
          origin,
          [...(origin.projectedProperties ?? []), ...chain],
          analysis,
          depth + 1,
          nextVisiting,
        ),
      ),
    );
  }
  if (ts.isObjectLiteralExpression(node)) {
    if (chain.length === 0) return undefined;
    const initializer = stablePropertyInitializer(node, chain[0]);
    if (!initializer) return undefined;
    return primitiveTargetRoots(
      { node: initializer, bindings: reference.bindings },
      chain.slice(1),
      analysis,
      depth + 1,
      visitingIdentifiers,
    );
  }
  if (ts.isConditionalExpression(node)) {
    const condition = normalizedExpression(
      expandProvenanceExpression({
        node: node.condition,
        bindings: reference.bindings,
      }),
    );
    if (["false", "null", "undefined", "void0"].includes(condition)) {
      return primitiveTargetRoots(
        { node: node.whenFalse, bindings: reference.bindings },
        chain,
        analysis,
        depth + 1,
        visitingIdentifiers,
      );
    }
    if (condition === "true") {
      return primitiveTargetRoots(
        { node: node.whenTrue, bindings: reference.bindings },
        chain,
        analysis,
        depth + 1,
        visitingIdentifiers,
      );
    }
    return combinePrimitiveRoots([
      primitiveTargetRoots(
        { node: node.whenTrue, bindings: reference.bindings },
        chain,
        analysis,
        depth + 1,
        visitingIdentifiers,
      ),
      primitiveTargetRoots(
        { node: node.whenFalse, bindings: reference.bindings },
        chain,
        analysis,
        depth + 1,
        visitingIdentifiers,
      ),
    ]);
  }
  if (!ts.isCallExpression(node)) return undefined;
  const pathHelper = pathHelperRootDescriptor(node, chain, reference, analysis);
  if (pathHelper) return new Set([pathHelper]);
  const pathOperation = canonicalPathOperation(node, reference, analysis);
  if (chain.length === 0 && pathOperation && node.arguments[0]) {
    return primitiveTargetRoots(
      { node: node.arguments[0], bindings: reference.bindings },
      [],
      analysis,
      depth + 1,
      visitingIdentifiers,
    );
  }
  const returns = callReturnReferences(node, reference, analysis);
  if (!returns) return undefined;
  return combinePrimitiveRoots(
    returns.map((returned) =>
      primitiveTargetRoots(
        returned,
        chain,
        analysis,
        depth + 1,
        visitingIdentifiers,
      ),
    ),
  );
}

function primitiveRootsMatch(targetRoots, authorityRoots) {
  return Boolean(
    targetRoots &&
      authorityRoots &&
      targetRoots.size > 0 &&
      authorityRoots.size > 0 &&
      [...targetRoots].every((root) => authorityRoots.has(root)),
  );
}

function authorityRootDescriptor(reference) {
  const descriptor = rootDescriptorFromExpression(
    expandProvenanceExpression(reference),
  );
  return descriptor ? new Set([descriptor]) : undefined;
}

function directPrimitiveProvenanceBinding(node, targetNode, analysis) {
  let runRoot;
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
      runRoot = stablePropertyInitializer(object, "runRoot");
      break;
    }
  }
  if (!runRoot) return false;
  let owner;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      owner = current;
      break;
    }
  }
  const ownerName = owner && analysis.namesByDefinition.get(owner);
  const calls = ownerName ? analysis.callsites.get(ownerName) ?? [] : [];
  const contexts = owner && calls.length > 0
    ? calls.flatMap((call) => callsiteBindingContexts(owner, call, analysis))
    : [new Map()];
  return contexts.every((bindings) =>
    primitiveRootsMatch(
      primitiveTargetRoots({ node: targetNode, bindings }, [], analysis),
      authorityRootDescriptor({ node: runRoot, bindings }),
    ),
  );
}

function guardedWrapperPrimitiveProvenanceBinding(
  node,
  targetNode,
  wrappers,
  analysis,
) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    const call = current.parent;
    if (!ts.isCallExpression(call)) continue;
    const callbackIndex = call.arguments.indexOf(current);
    if (callbackIndex < 0) continue;
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    const wrapper = wrappers.get(name);
    if (
      !wrapper?.guardedParameterIndexes.has(callbackIndex) ||
      !wrapper.authorityRoot ||
      !wrapper.definition
    ) {
      continue;
    }
    const bindings = functionCallBindings(wrapper.definition, call);
    if (
      primitiveRootsMatch(
        primitiveTargetRoots(
          { node: targetNode, bindings: new Map() },
          [],
          analysis,
        ),
        authorityRootDescriptor({ node: wrapper.authorityRoot, bindings }),
      )
    ) {
      return true;
    }
  }
  return false;
}

function functionsCalledOnlyUnderAuthority(sources, wrappers) {
  const definitions = new Map();
  const callsites = new Map();
  for (const { sourceFile } of sources) {
    const visit = (node) => {
      const definition = namedFunction(node);
      if (definition) {
        const existing = definitions.get(definition.name) ?? [];
        existing.push(definition.node);
        definitions.set(definition.name, existing);
      }
      if (ts.isCallExpression(node)) {
        const localName = calleeName(node.expression);
        const name = importedNames(sourceFile).get(localName) ?? localName;
        if (name) {
          const existing = callsites.get(name) ?? [];
          existing.push(node);
          callsites.set(name, existing);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const memo = new Map();
  const visiting = new Set();
  const guarded = (name) => {
    if (memo.has(name)) return memo.get(name);
    if (visiting.has(name) || definitions.get(name)?.length !== 1) return false;
    const calls = callsites.get(name) ?? [];
    if (calls.length === 0) return false;
    visiting.add(name);
    const result = calls.every((call) => {
      if (
        insideGuardedMutation(call) ||
        insideGuardedWrapperCallback(call, wrappers)
      ) {
        return true;
      }
      const owner = enclosingFunction(call);
      return owner !== "<module>" && owner !== name && guarded(owner);
    });
    visiting.delete(name);
    memo.set(name, result);
    return result;
  };
  const rootBound = (name, expandedTarget, visiting = new Set()) => {
    const definitionsForName = definitions.get(name);
    if (definitionsForName?.length !== 1) return false;
    const calls = callsites.get(name) ?? [];
    if (calls.length === 0) return false;
    const visitKey = `${name}\0${expandedTarget}`;
    if (visiting.has(visitKey)) return false;
    const nextVisiting = new Set([...visiting, visitKey]);
    const definition = definitionsForName[0];
    return calls.every((call) => {
      let targetAtCall = expandedTarget;
      definition.parameters.forEach((parameter, index) => {
        if (!ts.isIdentifier(parameter.name) || !call.arguments[index]) return;
        const argument = expandedExpression(
          call.arguments[index],
          declarationsVisibleFrom(call),
        );
        targetAtCall = targetAtCall.replace(
          new RegExp(`\\b${parameter.name.text}\\b`, "g"),
          `(${argument})`,
        );
      });
      if (directAuthorityBinding(call, targetAtCall)) return true;

      let callback;
      for (let current = call.parent; current; current = current.parent) {
        if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
          callback = current;
          break;
        }
        if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) break;
      }
      if (callback) {
        let declaration;
        for (let current = callback.parent; current; current = current.parent) {
          if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
            declaration = current;
            break;
          }
          if (ts.isFunctionLike(current)) break;
        }
        if (declaration) {
          const callbackCalls = callsites.get(declaration.name.text) ?? [];
          if (
            callbackCalls.length > 0 &&
            callbackCalls.every((callbackCall) => {
              let targetAtCallbackCall = targetAtCall;
              callback.parameters.forEach((parameter, index) => {
                if (!ts.isIdentifier(parameter.name) || !callbackCall.arguments[index]) return;
                const argument = expandedExpression(
                  callbackCall.arguments[index],
                  declarationsVisibleFrom(callbackCall),
                );
                targetAtCallbackCall = targetAtCallbackCall.replace(
                  new RegExp(`\\b${parameter.name.text}\\b`, "g"),
                  `(${argument})`,
                );
              });
              if (directAuthorityBinding(callbackCall, targetAtCallbackCall)) return true;
              const defaultGateRunner =
                name === "runGates" &&
                declaration.name.text === "gateRunner" &&
                ts.isBinaryExpression(declaration.initializer) &&
                declaration.initializer.operatorToken.kind ===
                  ts.SyntaxKind.QuestionQuestionToken &&
                declaration.initializer.left.getText() === "options.gateRunner";
              if (
                defaultGateRunner &&
                directCanonicalRunBinding(callbackCall, targetAtCallbackCall)
              ) {
                return true;
              }
              const callbackOwner = enclosingFunction(callbackCall);
              return (
                callbackOwner !== "<module>" &&
                callbackOwner !== declaration.name.text &&
                rootBound(callbackOwner, targetAtCallbackCall, nextVisiting)
              );
            })
          ) {
            return true;
          }
        }
      }

      const owner = enclosingFunction(call);
      return (
        owner !== "<module>" &&
        owner !== name &&
        rootBound(owner, targetAtCall, nextVisiting)
      );
    });
  };
  return { guarded, rootBound };
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
  const primitiveProvenance = primitiveProvenanceAnalysis(sources);
  const authorityFlow = functionsCalledOnlyUnderAuthority(sources, wrappers);
  const mutationWrappers = mutationWrapperSummaries(sources);
  const occurrences = new Map();
  for (const { absolute, sourceFile } of sources) {
    const visit = (node) => {
      const mutations = directMutationTargets(node, sourceFile, mutationWrappers);
      const targetKinds = mutations.map((mutation) =>
        mutation.operation === "atomicWriteGeneratedSiteFile"
          ? "live"
          : generatedTargetKind(mutation.expandedTarget),
      );
      const includeUnclassifiedRenameEnd =
        mutations.length === 2 &&
        mutations.every((mutation) => mutation.operation.startsWith("rename-")) &&
        targetKinds.some(Boolean);
      mutations.forEach((mutation, index) => {
        const targetKind = targetKinds[index] ??
          (includeUnclassifiedRenameEnd ? "unclassified" : undefined);
        if (!targetKind) return;
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const modulePath = path.relative(repository, absolute);
        const functionName = enclosingFunction(node);
        const occurrenceBase = `${modulePath}#${functionName}:${mutation.operation}:${targetKind}`;
        const occurrence = (occurrences.get(occurrenceBase) ?? 0) + 1;
        occurrences.set(occurrenceBase, occurrence);
        const guardedByCallFlow = authorityFlow.guarded(functionName);
        const rootBoundByCallFlow = authorityFlow.rootBound(
          functionName,
          mutation.expandedTarget,
        );
        const guarded =
          mutation.guardedByWrapper ||
          insideGuardedMutation(node) ||
          insideGuardedWrapperCallback(node, wrappers) ||
          guardedByCallFlow;
        const validatedRecoveryTarget =
          modulePath === "src/lib/candidate.ts" &&
          functionName === "recoverCanonicalCandidate" &&
          mutation.operation === "rename-source-removal" &&
          mutation.expandedTarget === "valid[0].root";
        const generatedPrimitive =
          mutation.operation === "atomicWriteGeneratedSiteFile";
        const primitiveRunBound =
          directAuthorityRunBinding(node, mutation.expandedRunId) ||
          guardedWrapperRunBinding(node, mutation.expandedRunId, wrappers);
        const primitivePathBound =
          generatedPrimitive &&
          (directAuthorityBinding(node, mutation.expandedTarget) ||
            directPrimitiveProvenanceBinding(
              node,
              mutation.targetNode,
              primitiveProvenance,
            ) ||
            guardedWrapperPrimitiveProvenanceBinding(
              node,
              mutation.targetNode,
              wrappers,
              primitiveProvenance,
            ));
        const primitiveRootBound =
          generatedPrimitive &&
          primitiveRunBound &&
          primitivePathBound;
        findings.push({
          scannerKey: `write:${occurrenceBase}:${occurrence}`,
          module: modulePath,
          function: functionName,
          operation: mutation.operation,
          line: position.line + 1,
          target: mutation.expandedTarget,
          targetKind,
          guarded,
          rootBound: generatedPrimitive
            ? primitiveRootBound
            : mutation.rootBoundByWrapper ||
              directAuthorityBinding(node, mutation.expandedTarget) ||
              rootBoundByCallFlow ||
              validatedRecoveryTarget ||
              (mutation.guardedByWrapper && targetCarriesGeneratedRoot(mutation.expandedTarget)),
        });
      });
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function readInventory() {
  const markdown = fs.readFileSync(inventoryPath, "utf8");
  const match = markdown.match(/```json inventory\n([\s\S]*?)\n```/);
  assert.ok(match, "writer inventory must contain one `json inventory` block");
  return JSON.parse(match[1]);
}

const promotionRecoveryFunctions = new Set([
  "abandonInvalidCanonicalCandidate",
  "cleanupCandidateDiagnosticsUnderAuthority",
  "promoteCandidate",
  "recoverCanonicalCandidate",
  "restorePromotionFootprint",
]);

function authorityAllows(finding, authority) {
  if (!finding) return false;
  if (authority === "guarded-mutation") {
    return finding.targetKind === "live" && finding.guarded && finding.rootBound;
  }
  if (authority === "candidate-compiler") {
    return finding.targetKind === "candidate";
  }
  if (authority === "promotion-recovery") {
    return (
      finding.module === "src/lib/candidate.ts" &&
      promotionRecoveryFunctions.has(finding.function) &&
      finding.guarded &&
      finding.rootBound &&
      ["candidate", "live", "promotion"].includes(finding.targetKind)
    );
  }
  return authority === "test-only" && /(?:\.test|\.fixture\.test)\.tsx?$/.test(finding.module);
}

function allScannerKeys(inventory) {
  return inventory.writers.flatMap((writer) => writer.scannerKeys);
}

function findingArtifact(finding) {
  const target = finding.target;
  if (finding.targetKind === "candidate") return "candidate/**";
  if (finding.targetKind === "promotion") return ".site-promotion-*/**";
  if (finding.operation === "atomicWriteGeneratedSiteFile") {
    return "site/assets/generated/**";
  }
  if (finding.module === "src/lib/siteTokens.ts") {
    if (/\.tokensCss\b/.test(target)) return "site/tokens.css";
    if (/\.sourceTokens\b/.test(target)) return "tokens.json";
    if (/\.history\b/.test(target)) return "token-history.json";
  }
  if (finding.module === "src/lib/siteMotion.ts") {
    if (/\.manifestScript\b/.test(target)) return "site/motion-manifest.js";
    if (/\.manifest\b/.test(target)) return "site/motion.json";
    if (/\.history\b/.test(target)) return "motion-history.json";
  }
  if (finding.module === "src/lib/elementEditor.ts") {
    if (/\.index\b/.test(target)) return "site/index.html";
    if (/\.history\b/.test(target)) return "element-history.json";
  }
  if (finding.module === "src/lib/gates.ts") {
    return finding.operation === "rename-source-removal"
      ? "gates.json temporary sibling"
      : "gates.json";
  }
  if (/\b(?:catalog|writeCatalog)\b/.test(`${finding.operation} ${target}`)) {
    return "image-library.json";
  }
  if (/\b(?:ledger|reserveImageGeneration|finishImageGeneration|finishInlineImageGeneration)\b/.test(
    `${finding.operation} ${target}`,
  )) {
    return "image-generation-ledger.json";
  }
  if (finding.module === "src/lib/candidate.ts" && finding.targetKind === "live") {
    return /gates/.test(target) ? "gates.json" : "site/**";
  }
  if (finding.targetKind === "live") return "site/**";
  return undefined;
}

function inventoryDispositionViolations(findings, inventory) {
  const writerByScannerKey = new Map(
    inventory.writers.flatMap((writer) =>
      writer.scannerKeys.map((scannerKey) => [scannerKey, writer]),
    ),
  );
  const violations = [];
  for (const finding of findings) {
    const artifact = findingArtifact(finding);
    const writer = writerByScannerKey.get(finding.scannerKey);
    const declared = writer
      ? new Set([
          ...(writer.rollbackArtifacts ?? []),
          ...(writer.nonRollbackArtifacts ?? []),
          ...(writer.transactionArtifacts ?? []),
        ])
      : new Set();
    if (!artifact || !declared.has(artifact)) {
      violations.push(`${finding.scannerKey} -> ${artifact ?? "unmapped artifact"}`);
    }
  }
  return violations;
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

test("raw generated-state writes are classified per callsite, not by a guard token in the function", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/per-callsite.ts",
      `
        export async function tokenEscape() {
          const files = { tokensCss: path.join(runRoot, "site", "tokens.css") };
          await atomicWrite(files.tokensCss, "escaped");
          return runGuardedMutation({ mutate: async () => undefined });
        }
        export async function motionEscape() {
          const files = { manifestScript: path.join(runRoot, "site", "motion-manifest.js") };
          return runGuardedMutation({
            mutate: async () => undefined,
            commit: async () => undefined,
          }).then(async () => atomicWrite(files.manifestScript, "escaped"));
        }
        export async function catalogEscape() {
          const files = { catalog: path.join(runRoot, "image-library.json") };
          await atomicWrite(files.catalog, "escaped");
          return withSiteAuthorityLock(runId, async () => undefined);
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(fixtureSources).map(({ function: functionName, guarded }) => ({
      function: functionName,
      guarded,
    })),
    [
      { function: "tokenEscape", guarded: false },
      { function: "motionEscape", guarded: false },
      { function: "catalogEscape", guarded: false },
    ],
  );
});

test("aliased filesystem imports and file-handle writes remain visible", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/aliased-sinks.ts",
      `
        import { open as openFile, writeFile as persist } from "node:fs/promises";
        export async function aliasedEscape() {
          const files = { index: path.join(runRoot, "site", "index.html") };
          await persist(files.index, "escaped");
        }
        export async function handleEscape() {
          const files = { history: path.join(runRoot, "element-history.json") };
          const handle = await openFile(files.history, "w");
          await handle.writeFile("escaped");
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(fixtureSources).map(({ function: functionName, guarded }) => ({
      function: functionName,
      guarded,
    })),
    [
      { function: "aliasedEscape", guarded: false },
      { function: "handleEscape", guarded: false },
    ],
  );
});

test("aliased imported mutation helpers remain visible at the caller", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/catalog-helper.ts",
      `
        export async function writeCatalog(filePath: string) {
          await atomicWrite(filePath, "catalog");
        }
      `,
    ),
    fixtureSource(
      "fixtures/catalog-caller.ts",
      `
        import { writeCatalog as persistCatalog } from "./catalog-helper";
        export async function aliasedHelperEscape() {
          const files = { catalog: path.join(runRoot, "image-library.json") };
          await persistCatalog(files.catalog);
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(fixtureSources).map(({ function: functionName, guarded }) => ({
      function: functionName,
      guarded,
    })),
    [{ function: "aliasedHelperEscape", guarded: false }],
  );
});

test("candidate imports never grant a module-wide writer exception", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/mixed-candidate.ts",
      `
        import { candidatePaths } from "../candidate";
        export async function writeCandidate() {
          const paths = candidatePaths(runId);
          await fs.writeFile(paths.gates, "candidate");
        }
        export async function escapeCandidateAuthority() {
          const roots = sitePaths(runId);
          await fs.writeFile(roots.site, "live");
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(fixtureSources).map(
      ({ function: functionName, targetKind }) => ({
        function: functionName,
        targetKind,
      }),
    ),
    [
      { function: "writeCandidate", targetKind: "candidate" },
      { function: "escapeCandidateAuthority", targetKind: "live" },
    ],
  );
});

test("helper-mediated gate and ledger writes preserve their caller authority", () => {
  const guardedFixture = [
    fixtureSource(
      "fixtures/guarded-helpers.ts",
      `
        async function writeGates(runRoot: string) {
          await fs.writeFile(path.join(runRoot, "gates.json"), "reports");
        }
        async function writeLedger(filePath: string) {
          await atomicWrite(filePath, "ledger");
        }
        export async function runGates() {
          await writeGates(runRoot);
        }
        export async function reconcile() {
          const files = { ledger: path.join(runRoot, "image-generation-ledger.json") };
          await writeLedger(files.ledger);
        }
        export async function guardedApproval() {
          return withSiteAuthorityLock(runId, async () => runGates());
        }
        export async function guardedReconciliation() {
          return withSiteAuthorityLock(runId, async () => reconcile());
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(guardedFixture).map(({ function: functionName, guarded }) => ({
      function: functionName,
      guarded,
    })),
    [
      { function: "writeGates", guarded: true },
      { function: "reconcile", guarded: true },
    ],
  );

  const escapedFixture = [
    fixtureSource(
      "fixtures/escaped-helpers.ts",
      `
        async function writeGates(runRoot: string) {
          await fs.writeFile(path.join(runRoot, "gates.json"), "reports");
        }
        async function writeLedger(filePath: string) {
          await atomicWrite(filePath, "ledger");
        }
        export async function runGates() {
          await writeGates(runRoot);
        }
        export async function reconcile() {
          const files = { ledger: path.join(runRoot, "image-generation-ledger.json") };
          await writeLedger(files.ledger);
        }
        export async function escaped() {
          await runGates();
          await reconcile();
          return withSiteAuthorityLock(runId, async () => undefined);
        }
      `,
    ),
  ];
  assert.deepEqual(
    directLiveSiteWrites(escapedFixture).map(({ function: functionName, guarded }) => ({
      function: functionName,
      guarded,
    })),
    [
      { function: "writeGates", guarded: false },
      { function: "reconcile", guarded: false },
    ],
  );
});

test("candidate and promotion authorities reject live-path and unapproved-callsite escapes", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/candidate.ts",
      `
        export async function compileCandidate() {
          const paths = candidatePaths(runId);
          await fs.writeFile(paths.gates, "candidate");
        }
        export async function candidatePathEscape() {
          const roots = sitePaths(runId);
          await fs.writeFile(roots.site, "escaped");
        }
        export async function promoteCandidate() {
          const roots = sitePaths(runId);
          await fs.rename(staging, roots.site);
        }
        export async function inventedRecovery() {
          const roots = sitePaths(runId);
          return withSiteAuthorityLock(runId, async () => {
            await fs.rename(staging, roots.site);
          });
        }
      `,
    ),
  ];
  const findings = new Map(
    directLiveSiteWrites(fixtureSources).map((finding) => [finding.function, finding]),
  );
  assert.equal(authorityAllows(findings.get("compileCandidate"), "candidate-compiler"), true);
  assert.equal(authorityAllows(findings.get("candidatePathEscape"), "candidate-compiler"), false);
  assert.equal(authorityAllows(findings.get("promoteCandidate"), "promotion-recovery"), false);
  assert.equal(authorityAllows(findings.get("inventedRecovery"), "promotion-recovery"), false);
});

test("rename inventories source removal and destination creation independently", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/rename-ends.ts",
      `
        export async function evacuateLiveSite() {
          const roots = sitePaths(runId);
          await withSiteAuthorityLock(runId, async () => {
            await fs.rename(roots.site, archiveRoot);
          });
        }
      `,
    ),
  ];
  const findings = directLiveSiteWrites(fixtureSources);
  assert.deepEqual(
    findings.map(({ operation, targetKind }) => ({ operation, targetKind })),
    [
      { operation: "rename-source-removal", targetKind: "live" },
      { operation: "rename-destination-creation", targetKind: "unclassified" },
    ],
  );
  assert.deepEqual(
    findings.map((finding) => authorityAllows(finding, "guarded-mutation")),
    [true, false],
    "live source authority must not bless an unclassified rename destination",
  );
});

test("guarded authority requires the write target to share the lock run and root", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/root-bound.ts",
      `
        export async function matchingRoot() {
          const files = sitePaths(runId);
          return withSiteAuthorityLock(runId, async () => {
            await atomicWrite(files.gates, "ok");
          }, { runRoot: files.root });
        }
        export async function mismatchedRoot() {
          const authorized = sitePaths(runId);
          const foreign = sitePaths(otherRunId);
          return withSiteAuthorityLock(runId, async () => {
            await atomicWrite(foreign.gates, "escape");
          }, { runRoot: authorized.root });
        }
      `,
    ),
  ];
  const findings = new Map(
    directLiveSiteWrites(fixtureSources).map((finding) => [finding.function, finding]),
  );
  assert.equal(authorityAllows(findings.get("matchingRoot"), "guarded-mutation"), true);
  assert.equal(authorityAllows(findings.get("mismatchedRoot"), "guarded-mutation"), false);
});

test("runGuardedMutation authority rejects a later options spread", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/guarded-authority-spread.ts",
      `
        export async function replaceableAuthority() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            ...getRuntimeAuthorityOverride(),
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(runId, files.index, "escape");
            },
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later spread can replace both authority bindings at runtime",
  );
});

test("runGuardedMutation authority rejects a later duplicate runId", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/guarded-authority-duplicate-run.ts",
      `
        export async function replaceableRunId() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            runId: "foreign-run",
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(runId, files.index, "escape");
            },
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later runId property replaces the traced run binding at runtime",
  );
});

test("runGuardedMutation authority rejects a later duplicate runRoot", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/guarded-authority-duplicate-root.ts",
      `
        export async function replaceableRunRoot() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            runRoot: sitePaths("foreign-run").root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(runId, files.index, "escape");
            },
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later runRoot property replaces the traced root binding at runtime",
  );
});

test("guarded callback wrappers reject a later authority spread", () => {
  const fixtureSources = [
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        import { sitePaths } from "../../../lib/runstate";
        async function guardedWrite(runId, runRoot, callback) {
          return runGuardedMutation({
            runId,
            runRoot,
            ...getRuntimeAuthorityOverride(),
            mutate: async () => callback(),
          });
        }
        export async function writeThroughReplaceableWrapper() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return guardedWrite(runId, files.root, async () => {
            await atomicWriteGeneratedSiteFile(runId, files.index, "escape");
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a wrapper must not export run or root provenance from replaceable options",
  );
});

test("withSiteAuthorityLock options reject a later runRoot spread", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/site-authority-options-spread.ts",
      `
        export async function replaceableLockRoot() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return withSiteAuthorityLock(runId, async () => {
            await fs.writeFile(files.gates, "escape");
          }, {
            runRoot: files.root,
            ...getRuntimeAuthorityOverride(),
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later spread can replace withSiteAuthorityLock's requested root",
  );
});

test("withSiteAuthorityLock options reject a later duplicate runRoot", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/site-authority-options-duplicate-root.ts",
      `
        export async function replaceableLockRoot() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          return withSiteAuthorityLock(runId, async () => {
            await fs.writeFile(files.gates, "escape");
          }, {
            runRoot: files.root,
            runRoot: sitePaths("foreign-run").root,
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later property can replace withSiteAuthorityLock's requested root",
  );
});

for (const authorityOverride of [
  {
    name: "spread",
    source: "...getRuntimeAuthorityOverride(),",
  },
  {
    name: "computed property",
    source: '[getRuntimeAuthorityKey()]: sitePaths("foreign-run").root,',
  },
  {
    name: "duplicate runRoot",
    source: 'runRoot: sitePaths("foreign-run").root,',
  },
]) {
  test(`default gate runner rejects a later ${authorityOverride.name} lock override`, () => {
    const fixtureSources = [
      fixtureSource(
        `fixtures/default-gate-runner-${authorityOverride.name.replaceAll(" ", "-")}.ts`,
        `
          async function runGates(runId, gateOptions) {
            await fs.writeFile(
              path.join(createLiveGateTarget(runId, gateOptions).runRoot, "gates.json"),
              "reports",
            );
          }
          export async function guardedMutation(options) {
            const runId = options.runId;
            const files = sitePaths(runId);
            return withSiteAuthorityLock(runId, async () => {
              const gateRunner = options.gateRunner ??
                ((gateRunId, gateOptions) =>
                  runGates(gateRunId, { afterEdit: gateOptions.afterEdit }));
              await gateRunner(runId, { afterEdit: true });
            }, {
              runRoot: files.root,
              ${authorityOverride.source}
            });
          }
        `,
      ),
    ];
    const [finding] = directLiveSiteWrites(fixtureSources);
    assert.equal(finding.guarded, true);
    assert.equal(
      authorityAllows(finding, "guarded-mutation"),
      false,
      `the default gate runner must not recover authority after a ${authorityOverride.name} override`,
    );
  });
}

test("root binding rejects overlapping but distinct path identifiers", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/overlapping-root-identifiers.ts",
      `
        export async function overlappingRootNames(files, other) {
          return withSiteAuthorityLock(runId, async () => {
            await fs.writeFile(other.files.gates, "escape");
          }, { runRoot: files.root });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.rootBound, false);
  assert.equal(authorityAllows(finding, "guarded-mutation"), false);
});

test("generated-site primitive requires its run argument to match authority", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/cross-run-generated-primitive.ts",
      `
        export async function crossRunPrimitive() {
          const files = sitePaths(runId);
          const otherFiles = sitePaths(otherRunId);
          return withSiteAuthorityLock(runId, async () => {
            await atomicWriteGeneratedSiteFile(otherRunId, otherFiles.index, "escape");
          }, { runRoot: files.root });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.guarded, true);
  assert.equal(authorityAllows(finding, "guarded-mutation"), false);
});

test("edit route primitive requires generatedImage.finalPath provenance", () => {
  const fixtureSources = [
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        async function applyElementHtmlEdit(runId, editId, transform) {
          return runGuardedMutation({
            runId,
            runRoot: sitePaths(runId).root,
            mutate: async () => transform("html"),
          });
        }
        export async function POST() {
          const runId = "authorized-run";
          let generatedImage;
          generatedImage = { finalPath: sitePaths("foreign-run").index };
          return applyElementHtmlEdit(runId, "edit", async () => {
            await atomicWriteGeneratedSiteFile(
              runId,
              generatedImage.finalPath,
              "escape",
            );
          });
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.target, "generatedImage.finalPath");
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "the production route identifier must not bless a foreign target",
  );
});

test("image finalizer primitive requires staged.finalPath provenance", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        async function finalizeStagedGeneration(input, files, staged) {
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = sitePaths(input.runId);
          const staged = { finalPath: sitePaths("foreign-run").index };
          return finalizeStagedGeneration(input, files, staged);
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.target, "staged.finalPath");
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "the production finalizer identifier must not bless a foreign target",
  );
});

test("primitive provenance rejects a spoofed sanitizer body", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        export async function readValidatedGeneratedImageStaging(
          runId,
          requestId,
          sitesRoot,
        ) {
          return { finalPath: sitePaths("foreign-run").index };
        }
        async function finalizeStagedGeneration(input, files) {
          const staged = await readValidatedGeneratedImageStaging(
            input.runId,
            "request",
          );
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = sitePaths(input.runId);
          return finalizeStagedGeneration(input, files);
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a trusted function name must not override its foreign-returning implementation",
  );
});

test("primitive provenance rejects an inner-callback finalPath reassignment", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        export async function readValidatedGeneratedImageStaging(
          runId,
          requestId,
          sitesRoot,
        ) {
          return {
            finalPath: path.join(
              sitePaths(runId).site,
              "assets/generated/request.png",
            ),
          };
        }
      `,
    ),
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        import {
          readValidatedGeneratedImageStaging,
        } from "../../../lib/imageLibrary";
        async function applyElementHtmlEdit(runId, editId, transform) {
          return runGuardedMutation({
            runId,
            runRoot: sitePaths(runId).root,
            mutate: async () => transform("html"),
          });
        }
        export async function POST() {
          const runId = "authorized-run";
          const generatedImage = await readValidatedGeneratedImageStaging(
            runId,
            "request",
          );
          return applyElementHtmlEdit(runId, "edit", async () => {
            generatedImage.finalPath = sitePaths("foreign-run").index;
            await atomicWriteGeneratedSiteFile(
              runId,
              generatedImage.finalPath,
              "escape",
            );
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a visible property reassignment before the sink must fail closed",
  );
});

test("primitive provenance rejects a parameter finalPath reassignment", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        async function readValidatedGeneratedImageStaging(runId) {
          return {
            finalPath: path.join(
              sitePaths(runId).site,
              "assets/generated/request.png",
            ),
          };
        }
        async function finalizeStagedGeneration(input, files, staged) {
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              staged.finalPath = sitePaths("foreign-run").index;
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = sitePaths(input.runId);
          const staged = await readValidatedGeneratedImageStaging(input.runId);
          return finalizeStagedGeneration(input, files, staged);
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a parameter property reassignment before the sink must fail closed",
  );
});

test("primitive provenance rejects an escaping libraryPaths implementation", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        function libraryPaths(runId, sitesRoot) {
          const roots = sitesRoot
            ? {
                root: path.join(sitesRoot, runId),
                site: path.join(sitesRoot, runId, "..", "foreign"),
              }
            : sitePaths(runId);
          return {
            root: roots.root,
            site: roots.site,
          };
        }
        async function readValidatedGeneratedImageStaging(
          runId,
          requestId,
          sitesRoot,
        ) {
          const files = libraryPaths(runId, sitesRoot);
          return {
            finalPath: path.join(
              files.site,
              "assets/generated/request.png",
            ),
          };
        }
        async function finalizeStagedGeneration(input, files, staged) {
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = libraryPaths(input.runId, "/sites");
          const staged = await readValidatedGeneratedImageStaging(
            input.runId,
            "request",
            "/sites",
          );
          return finalizeStagedGeneration(input, files, staged);
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a helper whose site path escapes the run root must fail closed",
  );
});

test("primitive provenance rejects a noncanonical sibling runstate import", () => {
  const fixtureSources = [
    fixtureSource(
      "src/evil/runstate.ts",
      `
        export function sitePaths(runId) {
          return {
            root: path.join("/sites", runId),
            index: path.join("/sites", "foreign", "index.html"),
          };
        }
      `,
    ),
    fixtureSource(
      "src/evil/writer.ts",
      `
        import { sitePaths } from "./runstate";
        async function readImage(runId) {
          return { finalPath: sitePaths(runId).index };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "only the resolved canonical src/lib/runstate.ts sitePaths export may be trusted",
  );
});

test("primitive provenance rejects a shadowed path helper identity", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        const path = {
          join(first, second, third) {
            return third === "site"
              ? "/sites/foreign"
              : first + "/" + second;
          },
        };
        function libraryPaths(runId, sitesRoot) {
          const roots = sitesRoot
            ? {
                root: path.join(sitesRoot, runId),
                site: path.join(sitesRoot, runId, "site"),
              }
            : sitePaths(runId);
          return {
            root: roots.root,
            site: roots.site,
          };
        }
        async function readValidatedGeneratedImageStaging(
          runId,
          requestId,
          sitesRoot,
        ) {
          const files = libraryPaths(runId, sitesRoot);
          return {
            finalPath: path.join(
              files.site,
              "assets/generated/request.png",
            ),
          };
        }
        async function finalizeStagedGeneration(input, files, staged) {
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = libraryPaths(input.runId, "/sites");
          const staged = await readValidatedGeneratedImageStaging(
            input.runId,
            "request",
            "/sites",
          );
          return finalizeStagedGeneration(input, files, staged);
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "the path.join shape must resolve to the canonical Node path import",
  );
});

test("primitive provenance rejects explicit path traversal", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import path from "node:path";
        import { sitePaths } from "./runstate";
        async function readValidatedGeneratedImageStaging(runId) {
          return {
            finalPath: path.join(
              sitePaths(runId).site,
              "..",
              "foreign.png",
            ),
          };
        }
        async function finalizeStagedGeneration(input, files, staged) {
          return runGuardedMutation({
            runId: input.runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                input.runId,
                staged.finalPath,
                "escape",
              );
            },
          });
        }
        export async function invokeFinalizer() {
          const input = { runId: "authorized-run" };
          const files = sitePaths(input.runId);
          const staged = await readValidatedGeneratedImageStaging(input.runId);
          return finalizeStagedGeneration(input, files, staged);
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "an explicit parent traversal must not retain the authorized root",
  );
});

test("primitive provenance rejects Object.assign finalPath mutation", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        export async function readValidatedGeneratedImageStaging(runId) {
          return { finalPath: sitePaths(runId).index };
        }
      `,
    ),
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        import {
          readValidatedGeneratedImageStaging,
        } from "../../../lib/imageLibrary";
        async function applyElementHtmlEdit(runId, editId, transform) {
          return runGuardedMutation({
            runId,
            runRoot: sitePaths(runId).root,
            mutate: async () => transform("html"),
          });
        }
        export async function POST() {
          const runId = "authorized-run";
          const generatedImage = await readValidatedGeneratedImageStaging(runId);
          return applyElementHtmlEdit(runId, "edit", async () => {
            Object.assign(generatedImage, {
              finalPath: sitePaths("foreign-run").index,
            });
            await atomicWriteGeneratedSiteFile(
              runId,
              generatedImage.finalPath,
              "escape",
            );
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "an Object.assign mutation before the sink must fail closed",
  );
});

test("primitive provenance rejects an unknown call-derived conditional branch", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        async function readImage(runId, flags) {
          return flags.useAuthorized
            ? { finalPath: sitePaths(runId).index }
            : { finalPath: sitePaths("foreign-run").index };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(runId, getRuntimeFlags());
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "an unknown call-derived condition must preserve both target branches",
  );
});

test("primitive provenance rejects a parameter-shadowed node:path binding", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import path from "node:path";
        import { sitePaths } from "./runstate";
        async function readImage(runId, { path }) {
          return {
            finalPath: path.join(
              sitePaths(runId).site,
              "assets/generated/request.png",
            ),
          };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(runId, {
            path: {
              join() {
                return "/sites/foreign/index.html";
              },
            },
          });
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "node:path import presence must not bless a shadowed local binding",
  );
});

test("primitive provenance rejects a nested Object.assign finalPath mutation", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        export async function readValidatedGeneratedImageStaging(runId) {
          return { finalPath: sitePaths(runId).index };
        }
      `,
    ),
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        import {
          readValidatedGeneratedImageStaging,
        } from "../../../lib/imageLibrary";
        async function applyElementHtmlEdit(runId, editId, transform) {
          return runGuardedMutation({
            runId,
            runRoot: sitePaths(runId).root,
            mutate: async () => transform("html"),
          });
        }
        export async function POST() {
          const runId = "authorized-run";
          const generatedImage = await readValidatedGeneratedImageStaging(runId);
          const holder = { image: generatedImage };
          return applyElementHtmlEdit(runId, "edit", async () => {
            Object.assign(holder.image, {
              finalPath: sitePaths("foreign-run").index,
            });
            await atomicWriteGeneratedSiteFile(
              runId,
              holder.image.finalPath,
              "escape",
            );
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a nested tracked property mutation before the sink must fail closed",
  );
});

test("primitive provenance rejects a computed carrier mutation", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        export async function readValidatedGeneratedImageStaging(runId) {
          return { finalPath: sitePaths(runId).index };
        }
      `,
    ),
    fixtureSource(
      "src/app/api/edit/route.ts",
      `
        import {
          readValidatedGeneratedImageStaging,
        } from "../../../lib/imageLibrary";
        async function applyElementHtmlEdit(runId, editId, transform) {
          return runGuardedMutation({
            runId,
            runRoot: sitePaths(runId).root,
            mutate: async () => transform("html"),
          });
        }
        export async function POST() {
          const runId = "authorized-run";
          const generatedImage = await readValidatedGeneratedImageStaging(runId);
          const holder = { image: generatedImage };
          const property = getRuntimeProperty();
          return applyElementHtmlEdit(runId, "edit", async () => {
            Object.assign(holder[property], {
              finalPath: sitePaths("foreign-run").index,
            });
            await atomicWriteGeneratedSiteFile(
              runId,
              holder.image.finalPath,
              "escape",
            );
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a computed mutation rooted at the tracked carrier must fail closed",
  );
});

test("primitive provenance rejects a custom-root spread override", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import path from "node:path";
        import { sitePaths } from "./runstate";
        function libraryPaths(runId, sitesRoot) {
          const overwrite = {
            site: path.join(sitesRoot, "foreign"),
          };
          const roots = sitesRoot
            ? {
                root: path.join(sitesRoot, runId),
                site: path.join(sitesRoot, runId, "site"),
                ...overwrite,
              }
            : sitePaths(runId);
          return {
            root: roots.root,
            site: roots.site,
          };
        }
        async function readImage(runId, sitesRoot) {
          const files = libraryPaths(runId, sitesRoot);
          return {
            finalPath: path.join(files.site, "assets/generated/request.png"),
          };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = libraryPaths(runId, "/sites");
          const image = await readImage(runId, "/sites");
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a spread that can overwrite the validated site path must fail closed",
  );
});

test("primitive provenance rejects an unknown path suffix", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import path from "node:path";
        import { sitePaths } from "./runstate";
        async function readImage(runId) {
          const suffix = getRuntimeSegment();
          return {
            finalPath: path.join(sitePaths(runId).site, suffix),
          };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "an unknown later path segment must fail closed",
  );
});

test("primitive provenance rejects a later finalPath spread override", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        async function readImage(runId) {
          return {
            finalPath: sitePaths(runId).index,
            ...getRuntimeOverride(),
          };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a later spread that can replace finalPath must fail closed",
  );
});

test("primitive provenance rejects a shadowed canonical sitePaths binding", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/imageLibrary.ts",
      `
        import { sitePaths } from "./runstate";
        async function readImage(runId, sitePaths) {
          return { finalPath: sitePaths(runId).index };
        }
        export async function writeImage() {
          const runId = "authorized-run";
          const files = sitePaths(runId);
          const image = await readImage(
            runId,
            () => sitePaths("foreign-run"),
          );
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWriteGeneratedSiteFile(
                runId,
                image.finalPath,
                "escape",
              );
            },
          });
        }
      `,
    ),
  ];
  const finding = directLiveSiteWrites(fixtureSources).find(
    (candidate) => candidate.operation === "atomicWriteGeneratedSiteFile",
  );
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "canonical import presence must not bless a shadowed sitePaths binding",
  );
});

test("helper-mediated raw writes retain the caller's concrete run binding", () => {
  const fixtureSources = [
    fixtureSource(
      "fixtures/helper-root-bound.ts",
      `
        async function writeForeignGates() {
          const foreign = sitePaths(otherRunId);
          await fs.writeFile(foreign.gates, "escape");
        }
        export async function guardedCaller() {
          return withSiteAuthorityLock(runId, async () => writeForeignGates());
        }
      `,
    ),
  ];
  const [finding] = directLiveSiteWrites(fixtureSources);
  assert.equal(finding.function, "writeForeignGates");
  assert.equal(finding.guarded, true);
  assert.equal(
    authorityAllows(finding, "guarded-mutation"),
    false,
    "a guarded helper call must not bless a raw sink targeting another run",
  );
});

test("inventory disposition fails when one discovered artifact is omitted", () => {
  const fixtureSources = [
    fixtureSource(
      "src/lib/siteTokens.ts",
      `
        export async function applyTokenEdit() {
          const files = sitePaths(sitesRoot, runId);
          return runGuardedMutation({
            runId,
            runRoot: files.root,
            mutate: async () => {
              await atomicWrite(files.tokensCss, "css");
              await atomicWrite(files.sourceTokens, "json");
            },
          });
        }
      `,
    ),
  ];
  const findings = directLiveSiteWrites(fixtureSources);
  const incompleteInventory = {
    writers: [
      {
        id: "incomplete-token-writer",
        scannerKeys: findings.map((finding) => finding.scannerKey),
        rollbackArtifacts: ["site/tokens.css"],
        nonRollbackArtifacts: [],
        transactionArtifacts: [],
      },
    ],
  };
  assert.deepEqual(inventoryDispositionViolations(findings, incompleteInventory), [
    `${findings[1].scannerKey} -> tokens.json`,
  ]);
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
  assert.equal(inventory.schemaVersion, 2);
  assert.deepEqual(inventory.permittedAuthorities, permittedAuthorities);
  assert.ok(Array.isArray(inventory.writers) && inventory.writers.length > 0);

  for (const writer of inventory.writers) {
    assert.match(writer.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.ok(writer.endpoints.length > 0, `${writer.id}: endpoints required`);
    assert.ok(writer.modules.length > 0, `${writer.id}: modules required`);
    assert.ok(writer.filesWritten.length > 0, `${writer.id}: filesWritten required`);
    assert.ok(writer.snapshotSet.length > 0, `${writer.id}: snapshotSet required`);
    assert.ok(Array.isArray(writer.rollbackArtifacts), `${writer.id}: rollbackArtifacts required`);
    assert.ok(Array.isArray(writer.nonRollbackArtifacts), `${writer.id}: nonRollbackArtifacts required`);
    assert.ok(Array.isArray(writer.transactionArtifacts), `${writer.id}: transactionArtifacts required`);
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
  const discoveredKeys = [...new Set(liveWrites.map((finding) => finding.scannerKey))].sort();
  assert.deepEqual(inventoriedKeys.slice().sort(), discoveredKeys);
  assert.deepEqual(
    inventoryDispositionViolations(liveWrites, inventory),
    [],
    "every discovered operation must map to declared rollback, non-rollback, or transaction state",
  );
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
    return !authorityAllows(finding, writer.authority);
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
