/**
 * Before the e2e tests: wipe, migrate and seed the test database
 * (DATABASE_URL_TEST — never DATABASE_URL), clear the test uploads, build the
 * app and start it on port 3100. Returns the teardown that stops the server.
 *
 * E2E_SKIP_BUILD=1 reuses the previous .next-e2e build (faster reruns while
 * only tests changed).
 */
import { rmSync } from "node:fs";

import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetTestDatabase,
  seedTestDatabase,
  testDatabaseUrl,
} from "../test/test-db";

import { seedEnv } from "./support/accounts";
import { assertPortFree, buildApp, serverEnv, startApp, UPLOAD_DIR } from "./support/server";

export default async function globalSetup() {
  const url = testDatabaseUrl();
  await assertPortFree();

  await ensureTestDatabase(url);
  await resetTestDatabase(url);
  await migrateTestDatabase(url);
  seedTestDatabase(url, seedEnv());
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  rmSync("e2e/.auth", { recursive: true, force: true });

  const env = serverEnv(url);
  if (process.env.E2E_SKIP_BUILD !== "1") buildApp(env);
  const stop = await startApp(env);
  return stop;
}
