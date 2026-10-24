/**
 * Runs against the test database (DATABASE_URL_TEST from the repo-root .env,
 * migrated by test/vitest-global-setup.ts) — never the development one.
 * Everything happens inside transactions that are rolled back, so no data is
 * left behind. Skipped when no test database is configured.
 */
import path from "node:path";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "@/db";
import * as schema from "@/db/schema";

import { loadVersioned, updateVersioned, VersionConflictError } from "./versioned";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const url = process.env.DATABASE_URL_TEST;

const client = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;
const db = client ? drizzle(client, { schema }) : null;

afterAll(async () => {
  await client?.end();
});

class Rollback extends Error {}

/** Runs `work` in a transaction that is always rolled back. */
async function inRollback(work: (tx: Tx) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

async function insertFabric(tx: Tx, code: string) {
  const [row] = await tx
    .insert(schema.fabrics)
    .values({ brand: "TEST-OPTIMISTIC", code })
    .returning();
  return row;
}

describe.skipIf(!db)("updateVersioned (optimistic locking)", () => {
  it("updates and bumps the version when the version matches", async () => {
    await inRollback(async (tx) => {
      const row = await insertFabric(tx, "A");
      expect(row.version).toBe(1);
      const updated = await updateVersioned(tx, schema.fabrics, { id: row.id, version: 1 }, { colorKey: "GRİ" });
      expect(updated.version).toBe(2);
      expect(updated.colorKey).toBe("GRİ");
    });
  });

  it("second save with the stale version conflicts and changes nothing", async () => {
    await inRollback(async (tx) => {
      const row = await insertFabric(tx, "B");
      // Two tabs load version 1; the first one saves.
      await updateVersioned(tx, schema.fabrics, { id: row.id, version: 1 }, { colorKey: "FIRST" });

      // The second tab still holds version 1.
      const stale = updateVersioned(tx, schema.fabrics, { id: row.id, version: 1 }, { colorKey: "SECOND" });
      await expect(stale).rejects.toBeInstanceOf(VersionConflictError);

      const [current] = await tx.select().from(schema.fabrics).where(eq(schema.fabrics.id, row.id));
      expect(current.colorKey).toBe("FIRST");
      expect(current.version).toBe(2);
    });
  });

  it("conflicts when the row is gone", async () => {
    await inRollback(async (tx) => {
      const row = await insertFabric(tx, "C");
      await tx.delete(schema.fabrics).where(eq(schema.fabrics.id, row.id));
      await expect(
        updateVersioned(tx, schema.fabrics, { id: row.id, version: 1 }, { colorKey: "X" }),
      ).rejects.toBeInstanceOf(VersionConflictError);
    });
  });

  it("loadVersioned refuses a stale version up front", async () => {
    await inRollback(async (tx) => {
      const row = await insertFabric(tx, "D");
      expect((await loadVersioned(tx, schema.fabrics, { id: row.id, version: 1 })).code).toBe("D");
      await updateVersioned(tx, schema.fabrics, { id: row.id, version: 1 }, { colorKey: "X" });
      await expect(loadVersioned(tx, schema.fabrics, { id: row.id, version: 1 })).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    });
  });

  it("a conflict rolls back the other rows saved in the same transaction", async () => {
    const codes = ["E1", "E2"];
    const ids: string[] = [];
    // Committed setup, cleaned up at the end.
    await db!.transaction(async (tx) => {
      for (const code of codes) ids.push((await insertFabric(tx, code)).id);
    });
    try {
      // Someone else saves E2 first.
      await updateVersioned(db!, schema.fabrics, { id: ids[1], version: 1 }, { colorKey: "OTHER" });

      // Our form saves E1 then E2, both loaded at version 1.
      const save = db!.transaction(async (tx) => {
        await updateVersioned(tx, schema.fabrics, { id: ids[0], version: 1 }, { colorKey: "MINE" });
        await updateVersioned(tx, schema.fabrics, { id: ids[1], version: 1 }, { colorKey: "MINE" });
      });
      await expect(save).rejects.toBeInstanceOf(VersionConflictError);

      const rows = await db!.select().from(schema.fabrics).where(eq(schema.fabrics.brand, "TEST-OPTIMISTIC"));
      const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
      expect(byCode.E1).toMatchObject({ colorKey: null, version: 1 });
      expect(byCode.E2).toMatchObject({ colorKey: "OTHER", version: 2 });
    } finally {
      await db!.delete(schema.fabrics).where(eq(schema.fabrics.brand, "TEST-OPTIMISTIC"));
    }
  });
});
