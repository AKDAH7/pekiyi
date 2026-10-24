import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, storageStatePath } from "./e2e/support/accounts";

/**
 * Browser tests (`pnpm test:e2e`). The global setup resets the test database
 * and starts its own server on port 3100; see e2e/global-setup.ts. Uses the
 * locally installed Google Chrome — no browser downloads.
 *
 * One worker: the tests share one seeded database and some of them change
 * shared state (users, bank accounts), so they run one after another.
 */
export default defineConfig({
  testDir: "./e2e",
  // Not test-results/ itself: Playwright empties its output directory on every
  // run, and the unit tests leave the document renders in test-results/documents.
  outputDir: "./test-results/e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    {
      name: "chrome",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: storageStatePath("admin") },
    },
  ],
});
