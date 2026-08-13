import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The gate runner drives real Playwright + axe-core from server code.
  // Bundling them breaks axe injection (the transformed CommonJS bundle
  // leaks `module.exports` into the page → "module is not defined"), so
  // they must load from node_modules at runtime.
  serverExternalPackages: ["playwright", "@axe-core/playwright", "axe-core", "cheerio"],
  // The e2e + gate browsers address the dev server as 127.0.0.1; Next's
  // dev-origin protection otherwise 403s module-script chunk fetches
  // (Origin: 127.0.0.1 ≠ localhost) and the page never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
