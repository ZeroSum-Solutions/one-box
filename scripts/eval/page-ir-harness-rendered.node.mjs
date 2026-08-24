import assert from "node:assert/strict";
import test from "node:test";
import { renderedProductionBuildArgv } from "./page-ir-harness-rendered.mjs";

test("rendered production evidence uses the network-free webpack build path", () => {
  assert.deepEqual(renderedProductionBuildArgv({
    nodeExecutable: "/runtime/node",
    npmBundleRoot: "/runtime/npm",
    npmCliRelativePath: "bin/npm-cli.js",
  }), [
    "/runtime/node",
    "/runtime/npm/bin/npm-cli.js",
    "run",
    "build",
    "--",
    "--webpack",
  ]);
});
