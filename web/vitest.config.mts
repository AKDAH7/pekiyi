import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["**/*.test.ts"],
    // Browser tests live in e2e/ (*.spec.ts) and run with Playwright.
    exclude: ["**/node_modules/**", "**/.next/**", "**/.next-e2e/**", "e2e/**"],
    globalSetup: ["./test/vitest-global-setup.ts"],
  },
});
