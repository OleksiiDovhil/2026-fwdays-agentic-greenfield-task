import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Unit + component tests run on jsdom; pure `lib/` modules (TC-PURE-01) are
// framework-free and run identically here. Coverage uses the v8 provider with a
// json-summary reporter because `scripts/check-coverage-ratchet.mjs` reads
// `coverage/coverage-summary.json`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "components/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.d.ts", "**/*.eval.ts", "lib/**/index.ts"],
    },
  },
});
