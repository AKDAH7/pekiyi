/**
 * Makes sure the test database exists and is migrated before the DB-backed
 * unit tests run (they roll back everything they write). Without
 * DATABASE_URL_TEST those tests skip themselves.
 */
import { ensureTestDatabase, migrateTestDatabase, testDatabaseUrl } from "./test-db";

export default async function setup() {
  if (!process.env.DATABASE_URL_TEST) return;
  const url = testDatabaseUrl();
  await ensureTestDatabase(url);
  await migrateTestDatabase(url);
}
