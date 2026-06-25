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
    "next-env.d.ts",
    // Project Factory infra (Node CLI scripts + workflow definitions, not app
    // code) — linted by their own runtime, not by Next's React/web-vitals rules.
    "scripts/**",
    "automations/**",
    ".claude/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
