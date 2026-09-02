import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      ".worktrees/**",
      "scripts/smoke/google-maps-live.test.mjs",
    ],
  },
});
