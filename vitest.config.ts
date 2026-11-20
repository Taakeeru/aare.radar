import path from "path";
import { defineConfig } from "vitest/config";

// One fixed time zone for every run (as the template): the CI host is UTC, a laptop is not.
const TEST_TZ = process.env.CI_TZ || "UTC";
process.env.TZ = TEST_TZ;

export default defineConfig({
  // tsconfig sets jsx for Next; vitest's transformer needs it explicitly.
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  test: {
    environment: "node",
    env: { TZ: TEST_TZ },
    testTimeout: 30000,
    // .next: `next build` copies the repo into .next/standalone; never collect it.
    exclude: ["node_modules", ".next/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve("."),
    },
  },
});
