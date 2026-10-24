/**
 * The automated-test database (DATABASE_URL_TEST, e.g. "pekiyi_test" in the
 * same Docker Postgres). Shared by the vitest global setup (DB-backed unit
 * tests) and the Playwright global setup (e2e). Tests never touch
 * DATABASE_URL: `testDatabaseUrl()` refuses to return anything that could be
 * the development database.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const WEB_DIR = path.resolve(__dirname, "..");

config({ path: path.resolve(WEB_DIR, "../.env"), quiet: true });

/** DATABASE_URL_TEST, after checking it can't be the dev database. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("DATABASE_URL_TEST is not set. Add it to the repo-root .env (see .env.example).");
  }
  const test = new URL(url);
  if (!/_test$/.test(test.pathname.slice(1))) {
    throw new Error(`DATABASE_URL_TEST must name a database ending in "_test" (got "${test.pathname.slice(1)}").`);
  }
  const dev = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (dev && dev.host === test.host && dev.pathname === test.pathname) {
    throw new Error("DATABASE_URL_TEST points to the same database as DATABASE_URL.");
  }
  return url;
}

/** Creates the test database when it doesn't exist yet (the user owns the cluster in Docker). */
export async function ensureTestDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const sql = postgres(maintenance.toString(), { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql`select 1 as found from pg_database where datname = ${name}`;
    if (!row) await sql.unsafe(`create database "${name.replace(/"/g, '""')}"`);
  } finally {
    await sql.end();
  }
}

/** Drops every table (and drizzle's migration journal) so migrations start from zero. */
export async function resetTestDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      drop schema if exists drizzle cascade;
      drop schema if exists public cascade;
      create schema public;
    `);
  } finally {
    await sql.end();
  }
}

/** Applies the committed migrations (same as `pnpm db:migrate`). */
export async function migrateTestDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(WEB_DIR, "db/migrations") });
  } finally {
    await client.end();
  }
}

/** Runs the real seed script against the test database with the given extra env. */
export function seedTestDatabase(url: string, env: Record<string, string>): void {
  const result = spawnSync("pnpm", ["exec", "tsx", "db/seed.ts"], {
    cwd: WEB_DIR,
    env: { ...process.env, ...env, DATABASE_URL: url },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) throw new Error(`Seeding the test database failed (exit ${result.status}).`);
}
