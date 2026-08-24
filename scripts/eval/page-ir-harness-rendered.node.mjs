import assert from "node:assert/strict";
import test from "node:test";
import {
  renderedProductionBuildArgv,
  renderedSandboxProfile,
} from "./page-ir-harness-rendered.mjs";

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

test("rendered workers may signal only descendants in the same sandbox", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
  });

  assert.match(profile, /\(allow signal \(target same-sandbox\)\)/);
});

test("rendered build may refresh only the exact generated Next type file", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
    writeFiles: ["/snapshot/next-env.d.ts"],
  });

  assert.match(profile, /\(allow file-write\* \(literal "\/snapshot\/next-env\.d\.ts"\)\)/);
  assert.doesNotMatch(profile, /\(allow file-write\* \(subpath "\/snapshot\/next-env\.d\.ts"\)\)/);
});
