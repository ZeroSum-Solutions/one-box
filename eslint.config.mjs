import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Generated static-site output (including vendored GSAP) is linted at its
    // source/template boundary, not after copying into ignored run folders.
    "sites/**",
    // Git-ignored third-party grading references (never shipped code) — ESLint
    // walks the filesystem regardless of .gitignore.
    "references/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
