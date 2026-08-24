import assert from "node:assert/strict";
import crypto from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const adapter = await import("./page-ir-harness-browser.mjs").catch(() => ({}));
const BROWSER_AUTHORITY = (await adapter.inspectPageIrBrowserAuthority()).binding;

test("exports the bounded browser evidence adapter", () => {
  assert.equal(typeof adapter.capturePageIrBrowserEvidence, "function");
  assert.equal(typeof adapter.inspectPageIrBrowserAuthority, "function");
  assert.equal(typeof adapter.validateBrowserEvidenceViewports, "function");
});

const FROZEN_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "mobile", width: 390, height: 844 },
];

test("accepts only the exact manifest viewport set and returns canonical order", () => {
  assert.deepEqual(
    adapter.validateBrowserEvidenceViewports([
      FROZEN_VIEWPORTS[2],
      FROZEN_VIEWPORTS[0],
      FROZEN_VIEWPORTS[1],
    ]),
    FROZEN_VIEWPORTS,
  );
  for (const invalid of [
    FROZEN_VIEWPORTS.slice(0, 2),
    [...FROZEN_VIEWPORTS, { id: "wide", width: 1920, height: 1080 }],
    FROZEN_VIEWPORTS.map((entry) => entry.id === "tablet" ? { ...entry, height: 900 } : entry),
    [FROZEN_VIEWPORTS[0], FROZEN_VIEWPORTS[0], FROZEN_VIEWPORTS[2]],
  ]) {
    assert.throws(
      () => adapter.validateBrowserEvidenceViewports(invalid),
      /exact frozen browser evidence viewports/i,
    );
  }
});

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes) {
  assert.deepEqual(
    bytes.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function syntheticSite({ additionalScript = "" } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-site-"));
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await fs.writeFile(path.join(root, "pixel.png"), pixel);
  await fs.writeFile(path.join(root, "sw.js"), `self.addEventListener("install", (event) => {
  event.waitUntil(fetch("https://provider.invalid/service-worker").catch(() => undefined));
});`);
  await fs.writeFile(path.join(root, "index.html"), `<!doctype html>
<html><head><style>
.motion { transition-duration: 2s; }
@media (prefers-reduced-motion: reduce) { .motion { transition-duration: 0s; } }
</style></head><body>
<main id="core-content"><h1>Credential-free fixture</h1></main>
<a id="primary-action" href="/contact.html">Contact</a>
<div class="motion" id="motion-probe">Motion</div>
<img src="/pixel.png" alt="pixel">
<img src="/..%2Foutside.png" alt="blocked traversal">
<img src="https://provider.invalid/metered.png" alt="blocked external">
<script>
document.documentElement.dataset.js = "enabled";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
try { new WebSocket("wss://provider.invalid/socket"); } catch {}
${additionalScript}
console.error("fixture-console-error");
setTimeout(() => { throw new Error("fixture-page-error"); }, 0);
</script>
</body></html>`);
  await fs.writeFile(path.join(root, "contact.html"), "<!doctype html><title>Contact</title><p>Contact</p>");
  return root;
}

function nonLoopbackIpv4Address() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    const address = addresses?.find((entry) =>
      entry.family === "IPv4" && !entry.internal
    );
    if (address) return address.address;
  }
  return undefined;
}

test("captures exact credential-free rendered evidence into one temporary immutable packet", {
  timeout: 60_000,
}, async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));

  const packet = await adapter.capturePageIrBrowserEvidence({
    siteRoot,
    viewports: FROZEN_VIEWPORTS,
    coreContentSelectors: ["#core-content"],
    primaryActionSelectors: ["#primary-action"],
  });
  context.after(() => fs.rm(packet.packetRoot, { recursive: true, force: true }));

  assert.equal(packet.evidencePath, path.join(packet.packetRoot, "browser-evidence.json"));
  await assert.rejects(
    fs.lstat(path.join(packet.packetRoot, "evidence.json")),
    { code: "ENOENT" },
  );
  assert.equal(packet.evidence.schemaVersion, 1);
  assert.equal(packet.evidence.providerCalls, 0);
  assert.equal(packet.evidence.networkIsolation, "darwin-sandbox-exec-loopback-only");
  assert.deepEqual(packet.evidence.siteInventory.map(({ path }) => path), [
    "contact.html",
    "index.html",
    "pixel.png",
    "sw.js",
  ]);
  assert.ok(packet.evidence.siteInventory.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
  assert.deepEqual(packet.evidence.viewports, FROZEN_VIEWPORTS);
  assert.deepEqual(packet.evidence.attemptedExternalUrls, [
    "https://provider.invalid/metered.png",
    "wss://provider.invalid/socket",
  ]);
  assert.deepEqual(packet.evidence.rejectedStaticRequests, ["/..%2Foutside.png"]);
  assert.deepEqual(packet.evidence.captures.map((capture) => capture.id), [
    "desktop",
    "tablet",
    "mobile",
    "no-js",
    "reduced-motion",
  ]);

  const dimensions = new Map(FROZEN_VIEWPORTS.map((viewport) => [viewport.id, viewport]));
  dimensions.set("no-js", FROZEN_VIEWPORTS[0]);
  dimensions.set("reduced-motion", FROZEN_VIEWPORTS[0]);
  for (const capture of packet.evidence.captures) {
    const screenshot = await fs.readFile(path.join(packet.packetRoot, capture.screenshot.path));
    assert.deepEqual(pngDimensions(screenshot), {
      width: dimensions.get(capture.id).width,
      height: dimensions.get(capture.id).height,
    });
    assert.equal(capture.screenshot.sha256, sha256(screenshot));
    assert.equal(capture.screenshot.sizeBytes, screenshot.byteLength);
    assert.deepEqual(capture.coreContent, [{
      selector: "#core-content",
      present: true,
      visible: true,
      text: "Credential-free fixture",
    }]);
    assert.deepEqual(capture.primaryActions, [{
      selector: "#primary-action",
      present: true,
      visible: true,
      href: "/contact.html",
      text: "Contact",
    }]);
    assert.equal(capture.navigation.status, 200);
    assert.equal(capture.navigation.path, "/index.html");
    assert.ok(capture.metrics.domContentLoadedMs >= 0);
    assert.ok(capture.metrics.totalTransferBytes > 0);
    assert.ok(capture.metrics.imageTransferBytes > 0);
    assert.ok(Array.isArray(capture.localResourceFailures));
  }
  const desktop = packet.evidence.captures[0];
  assert.equal(desktop.javascriptMarker, "enabled");
  assert.equal(desktop.serviceWorkerRegistrations, 0);
  assert.ok(desktop.consoleErrors.some((message) => message.includes("fixture-console-error")));
  assert.ok(desktop.pageErrors.some((message) => message.includes("fixture-page-error")));
  const noJs = packet.evidence.captures.find((capture) => capture.id === "no-js");
  assert.equal(noJs.javascriptEnabled, false);
  assert.equal(noJs.javascriptMarker, null);
  const reduced = packet.evidence.captures.find((capture) => capture.id === "reduced-motion");
  assert.equal(reduced.reducedMotion, "reduce");
  assert.equal(reduced.reducedMotionMatches, true);
  assert.deepEqual(
    reduced.motionObservations.find((observation) => observation.id === "motion-probe"),
    {
      id: "motion-probe",
      animationDuration: "0s",
      transitionDuration: "0s",
    },
  );

  assert.deepEqual(
    packet.evidence.inventory.map((entry) => entry.path),
    packet.evidence.captures.map((capture) => capture.screenshot.path).sort(),
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(packet.evidencePath, "utf8")),
    packet.evidence,
  );
  assert.deepEqual((await fs.readdir(packet.packetRoot)).sort(), [
    "browser-evidence.json",
    "screenshots",
  ]);
  assert.deepEqual((await fs.readdir(path.join(packet.packetRoot, "screenshots"))).sort(), [
    "desktop.png",
    "mobile.png",
    "no-js.png",
    "reduced-motion.png",
    "tablet.png",
  ]);
});

test("captures blocking qualification measurements only when requested", {
  timeout: 60_000,
}, async (context) => {
  const siteRoot = await syntheticSite({
    additionalScript: "document.documentElement.dataset.js = 'ready';",
  });
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));

  const packet = await adapter.capturePageIrBrowserEvidence({
    siteRoot,
    viewports: FROZEN_VIEWPORTS,
    coreContentSelectors: ["#core-content"],
    primaryActionSelectors: ["#primary-action"],
    qualificationChecks: true,
  });
  context.after(() => fs.rm(packet.packetRoot, { recursive: true, force: true }));

  assert.equal(packet.evidence.qualificationChecks, true);
  for (const capture of packet.evidence.captures.filter(({ id }) =>
    ["desktop", "tablet", "mobile"].includes(id)
  )) {
    assert.equal(capture.metrics.cpuThrottleRate, 4);
    assert.equal(typeof capture.qualification.horizontalOverflow, "boolean");
    assert.ok(Array.isArray(capture.qualification.overflowingElements));
    assert.ok(Array.isArray(capture.qualification.keyboard.unreachedSelectors));
    assert.ok(Array.isArray(capture.qualification.accessibility.seriousOrCritical));
    assert.ok(Array.isArray(capture.qualification.accessibility.colorContrast));
  }
  const reducedMotion = packet.evidence.captures.find(({ id }) => id === "reduced-motion");
  assert.equal(reducedMotion.qualification.reducedMotion.matches, true);
  assert.equal(typeof reducedMotion.qualification.reducedMotion.allMotionDisabled, "boolean");
  assert.ok(Array.isArray(reducedMotion.qualification.reducedMotion.activeMotion));
});

test("refuses every caller request to reuse an outer sandbox", async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot,
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["#core-content"],
      primaryActionSelectors: ["#primary-action"],
      outerSandboxed: true,
    }),
    /outerSandboxed is unsupported/i,
  );
});

test("rejects fixture-bound evidence from a site without the frozen candidate build", async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot,
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["#core-content"],
      primaryActionSelectors: ["#primary-action"],
      fixtureBinding: {
        fixtureId: "brochure-local-service",
        fixtureManifestSha256: "a".repeat(64),
        buildSha256: "b".repeat(64),
      },
      browserAuthority: BROWSER_AUTHORITY,
    }),
    /candidate-manifest\.json/i,
  );
});

test("rejects fixture-bound capture when the Chromium bundle authority differs", async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot,
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["#core-content"],
      primaryActionSelectors: ["#primary-action"],
      fixtureBinding: {
        fixtureId: "brochure-local-service",
        fixtureManifestSha256: "a".repeat(64),
        buildSha256: "b".repeat(64),
      },
      browserAuthority: { ...BROWSER_AUTHORITY, bundleSha256: "c".repeat(64) },
    }),
    /Chromium bundle does not match the frozen authority/i,
  );
});

test("blocks Chromium WebRTC datagrams to a non-loopback interface", {
  timeout: 60_000,
}, async (context) => {
  const address = nonLoopbackIpv4Address();
  if (!address) {
    context.skip("requires one non-loopback IPv4 interface");
    return;
  }
  const listener = dgram.createSocket("udp4");
  const datagrams = [];
  listener.on("message", (message) => datagrams.push(message));
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.bind(0, "0.0.0.0", resolve);
  });
  context.after(() => listener.close());
  const target = `stun:${address}:${listener.address().port}`;
  const siteRoot = await syntheticSite({
    additionalScript: `try {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: ${JSON.stringify(target)} }] });
  peer.createDataChannel("network-isolation-probe");
  peer.createOffer().then((offer) => peer.setLocalDescription(offer)).catch(() => undefined);
  setTimeout(() => peer.close(), 1000);
} catch {}`,
  });
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  const packet = await adapter.capturePageIrBrowserEvidence({
    siteRoot,
    viewports: FROZEN_VIEWPORTS,
    coreContentSelectors: ["#core-content"],
    primaryActionSelectors: ["#primary-action"],
  });
  context.after(() => fs.rm(packet.packetRoot, { recursive: true, force: true }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(datagrams.length, 0);
});

test("rejects relative, symlinked, and internally symlinked static roots", async (context) => {
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot: "relative-site",
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["main"],
      primaryActionSelectors: ["a"],
    }),
    /absolute path/i,
  );

  const siteRoot = await syntheticSite();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-links-"));
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  context.after(() => fs.rm(parent, { recursive: true, force: true }));
  const rootLink = path.join(parent, "root-link");
  await fs.symlink(siteRoot, rootLink);
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot: rootLink,
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["main"],
      primaryActionSelectors: ["a"],
    }),
    /non-symlink directory/i,
  );

  await fs.symlink(path.join(siteRoot, "pixel.png"), path.join(siteRoot, "linked.png"));
  await assert.rejects(
    adapter.capturePageIrBrowserEvidence({
      siteRoot,
      viewports: FROZEN_VIEWPORTS,
      coreContentSelectors: ["main"],
      primaryActionSelectors: ["a"],
    }),
    /contains a symlink/i,
  );
});

test("rejects a static-site generation changed while it is being snapshotted", {
  timeout: 60_000,
}, async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  const packetPrefix = "one-box-page-ir-browser-evidence-";
  const snapshotPrefix = "one-box-page-ir-browser-site-snapshot-";
  const before = (await fs.readdir(os.tmpdir()))
    .filter((entry) => entry.startsWith(packetPrefix) || entry.startsWith(snapshotPrefix))
    .sort();
  const canonicalSiteRoot = await fs.realpath(siteRoot);
  const pixelPath = path.join(canonicalSiteRoot, "pixel.png");
  const indexPath = path.join(canonicalSiteRoot, "index.html");
  const originalOpen = fs.open;
  let changed = false;
  let unexpectedPacket;
  fs.open = async (file, ...args) => {
    if (!changed && path.resolve(String(file)) === pixelPath) {
      changed = true;
      await fs.appendFile(indexPath, "\n<!-- changed generation -->\n");
    }
    return originalOpen.call(fs, file, ...args);
  };
  try {
    await assert.rejects(
      adapter.capturePageIrBrowserEvidence({
        siteRoot,
        viewports: FROZEN_VIEWPORTS,
        coreContentSelectors: ["#core-content"],
        primaryActionSelectors: ["#primary-action"],
      }).then((packet) => {
        unexpectedPacket = packet;
        return packet;
      }),
      /static site.*changed|snapshot.*changed|generation/i,
    );
  } finally {
    fs.open = originalOpen;
    if (unexpectedPacket) {
      await fs.rm(unexpectedPacket.packetRoot, { recursive: true, force: true });
    }
  }
  assert.equal(changed, true);
  const after = (await fs.readdir(os.tmpdir()))
    .filter((entry) => entry.startsWith(packetPrefix) || entry.startsWith(snapshotPrefix))
    .sort();
  assert.deepEqual(after, before);
});

test("rejects a static-site root replaced during canonicalization", {
  timeout: 60_000,
}, async (context) => {
  const siteRoot = await syntheticSite();
  const replacementRoot = await syntheticSite();
  const movedRoot = `${siteRoot}-original`;
  context.after(async () => {
    await fs.rm(siteRoot, { recursive: true, force: true });
    await fs.rm(movedRoot, { recursive: true, force: true });
    await fs.rm(replacementRoot, { recursive: true, force: true });
  });
  const originalRealpath = fs.realpath;
  let replaced = false;
  let unexpectedPacket;
  fs.realpath = async (file, ...args) => {
    if (!replaced && path.resolve(String(file)) === siteRoot) {
      replaced = true;
      await fs.rename(siteRoot, movedRoot);
      await fs.symlink(replacementRoot, siteRoot);
    }
    return originalRealpath.call(fs, file, ...args);
  };
  try {
    await assert.rejects(
      adapter.capturePageIrBrowserEvidence({
        siteRoot,
        viewports: FROZEN_VIEWPORTS,
        coreContentSelectors: ["#core-content"],
        primaryActionSelectors: ["#primary-action"],
      }).then((packet) => {
        unexpectedPacket = packet;
        return packet;
      }),
      /site root.*changed|identity|generation/i,
    );
  } finally {
    fs.realpath = originalRealpath;
    if (unexpectedPacket) {
      await fs.rm(unexpectedPacket.packetRoot, { recursive: true, force: true });
    }
  }
  assert.equal(replaced, true);
});

test("removes the temporary packet when capture fails", async (context) => {
  const siteRoot = await syntheticSite();
  context.after(() => fs.rm(siteRoot, { recursive: true, force: true }));
  const prefix = "one-box-page-ir-browser-evidence-";
  const originalMkdtemp = fs.mkdtemp;
  let failedPacketRoot;
  fs.mkdtemp = async (candidatePrefix, ...args) => {
    const created = await originalMkdtemp.call(fs, candidatePrefix, ...args);
    if (candidatePrefix === path.join(os.tmpdir(), prefix)) failedPacketRoot = created;
    return created;
  };
  try {
    await assert.rejects(
      adapter.capturePageIrBrowserEvidence({
        siteRoot,
        viewports: FROZEN_VIEWPORTS,
        coreContentSelectors: ["["],
        primaryActionSelectors: ["#primary-action"],
      }),
      /selector|Unexpected token|not a valid selector/i,
    );
  } finally {
    fs.mkdtemp = originalMkdtemp;
  }
  assert.ok(failedPacketRoot);
  await assert.rejects(fs.stat(failedPacketRoot), { code: "ENOENT" });
});
