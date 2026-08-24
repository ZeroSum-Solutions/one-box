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
    operation: handleTarget ? `handle.${calleeName(node.expression)}` : (wrapper?.operation ?? operation),
    expandedTarget: wrapper
      ? wrapper.template.replaceAll(wrapper.parameterName, `(${expandedArgument})`)
      : expandedArgument,
    guardedByWrapper: wrapper?.guarded ?? false,
    rootBoundByWrapper: wrapper?.rootBound ?? false,
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
    if (!ts.isPropertyAssignment(property)) continue;
    if (property.name.getText().replace(/["']/g, "") === name) {
      return property.initializer;
    }
  }
  return undefined;
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
  const targetFamily = artifactFamily(expandedTarget);
  const rootFamily = artifactFamily(expandedRoot);
  return (
    targetFamily === rootFamily ||
    targetFamily === artifactFamily(expandedRoot) ||
    targetFamily.startsWith(`${artifactFamily(expandedRoot)}.`) ||
    targetFamily.startsWith(`path.join(${artifactFamily(expandedRoot)},`) ||
    targetFamily.startsWith(`path.resolve(${artifactFamily(expandedRoot)},`) ||
    targetFamily.includes(artifactFamily(expandedRoot))
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
        const runRoot = options && propertyInitializer(options, "runRoot");
        if (runRoot) {
          return targetMatchesRoot(
            expandedTarget,
            expandedExpression(runRoot, declarations),
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
    const runRoot = propertyInitializer(object, "runRoot");
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

function directCanonicalRunBinding(node, expandedTarget) {
  const declarations = declarationsVisibleFrom(node);
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    const call = current.parent;
    if (!ts.isCallExpression(call)) continue;
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    const runId = call.arguments[0];
    if (
      name === "withSiteAuthorityLock" &&
      call.arguments.indexOf(current) === 1 &&
      runId &&
      targetMatchesCanonicalRun(
        expandedTarget,
        expandedExpression(runId, declarations),
      )
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
    const localName = calleeName(call.expression);
    const name = importedNames(current.getSourceFile()).get(localName) ?? localName;
    if (wrappers.get(name)?.has(argumentIndex)) {
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
        findings.push({
          scannerKey: `write:${occurrenceBase}:${occurrence}`,
          module: modulePath,
          function: functionName,
          operation: mutation.operation,
          line: position.line + 1,
          target: mutation.expandedTarget,
          targetKind,
          guarded,
          rootBound:
            mutation.rootBoundByWrapper ||
            directAuthorityBinding(node, mutation.expandedTarget) ||
            rootBoundByCallFlow ||
            validatedRecoveryTarget ||
            (mutation.guardedByWrapper && targetCarriesGeneratedRoot(mutation.expandedTarget)) ||
            (guarded && mutation.operation === "atomicWriteGeneratedSiteFile"),
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
