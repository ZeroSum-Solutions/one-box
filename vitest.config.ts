import { defineConfig } from "vitest/config";

// Vitest owns src/**. The node:test suites under scripts/ run through test:plans and test:eval.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
