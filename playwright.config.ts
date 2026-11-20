import { defineConfig, devices } from "@playwright/test";

/**
 * Two ways to run:
 *
 * 1. Pandora's client CI (scripts/ci/client_flows.py): it starts the standalone
 *    server on a throwaway SQLite with the demo seed and a browser server, then
 *    runs `playwright test --grep @ci` here with CI_BASE_URL (the app),
 *    PW_TEST_CONNECT_WS_ENDPOINT (the browser; Playwright reads it itself) and
 *    CI_DEMO_ADMIN_EMAIL / CI_DEMO_ADMIN_PASSWORD. With CI_BASE_URL set this
 *    config starts NO server.
 * 2. By hand against a running server: PLAYWRIGHT_BASE_URL=http://localhost:3000
 *    npx playwright test (in a container; never `next dev` on the VPS host).
 *
 * localhost, not 127.0.0.1: the browser keeps the app's Secure session cookie
 * over plain http only for localhost.
 */
const BASE = process.env.CI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CI_MODE = !!process.env.CI_BASE_URL || process.env.E2E_CI === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  grep: CI_MODE ? /@ci\b/ : undefined,
  // Stop before the runner's own timeout so the JSON report is still written.
  globalTimeout: process.env.CI_BASE_URL ? 270 * 1000 : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: CI_MODE ? 1 : 0,
  workers: 1,
  reporter: CI_MODE ? [["list"], ["json", { outputFile: "./test-results/ci-results.json" }]] : [["list"]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  timeout: 30000,
});
