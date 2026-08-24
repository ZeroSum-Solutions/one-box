import assert from "node:assert/strict";
import test from "node:test";
import {
  renderedProductionBuildArgv,
  renderedSandboxProfile,
} from "./page-ir-harness-rendered.mjs";

test("rendered production evidence uses the canonical build path", () => {
  assert.deepEqual(renderedProductionBuildArgv({
    nodeExecutable: "/runtime/node",
    npmBundleRoot: "/runtime/npm",
    npmCliRelativePath: "bin/npm-cli.js",
  }), [
    "/runtime/node",
    "/runtime/npm/bin/npm-cli.js",
    "run",
    "build",
  ]);
});

test("rendered build permits loopback listen without outbound network", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
    networkMode: "build",
  });

  assert.match(profile, /\(deny network\*\)/);
  assert.match(profile, /\(allow network-inbound \(local tcp "localhost:\*"\)\)/);
  assert.doesNotMatch(profile, /allow network-outbound/);
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
