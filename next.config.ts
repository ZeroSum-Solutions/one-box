import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The gate runner drives real Playwright + axe-core from server code.
  // Bundling them breaks axe injection (the transformed CommonJS bundle
  // leaks `module.exports` into the page → "module is not defined"), so
  // they must load from node_modules at runtime.
  serverExternalPackages: ["playwright", "@axe-core/playwright", "axe-core", "cheerio"],
};

export default nextConfig;
