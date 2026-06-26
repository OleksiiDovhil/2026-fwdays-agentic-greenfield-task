import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Test files only: Vitest HOISTS `vi.mock(...)` factories above the import
  // section, so a factory that needs a module (e.g. `require("react")` to build
  // `React.createElement` stand-ins for a mocked library like react-leaflet) must
  // use `require()` inside the factory — a top-level `import` is not yet evaluated
  // when the hoisted factory runs. Allow `require` in test files so this standard
  // mocking pattern lints clean WITHOUT weakening any test. Scoped to *.test.* only.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
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
