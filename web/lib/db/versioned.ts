/**
 * Optimistic locking for editable records (see CLAUDE.md).
 *
 * Every edit form carries the `version` of the row it was loaded with. The
 * update only matches while the row still has that version, and bumps it:
 *
 *   UPDATE t SET ..., version = version + 1 WHERE id = $1 AND version = $2
 *
 * Zero rows means someone else saved first (or deleted the row). We then
 * throw `VersionConflictError`, which rolls the whole transaction back —
 * including other rows saved in the same form — and `runMutation`
 * (lib/actions.ts) turns it into the translated "changed by someone else"
 * message while the form keeps the user's input.
 *
 * Not `server-only` (only a type import of the db) so the conflict path can
 * be tested against a real database from vitest.
 */
import { and, eq, getTableName, sql } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";

export class VersionConflictError extends Error {
  constructor(
    readonly table: string,
    readonly id: string | number,
  ) {
    super(`Version conflict on ${table} ${id}`);
    this.name = "VersionConflictError";
  }
}

type VersionedTable = PgTable & { id: PgColumn; version: PgColumn };

/** The row as it is when the client loaded it. */
export type Expected = { id: string | number; version: number };

/**
 * Updates one row if it still has `expected.version`; throws
 * `VersionConflictError` otherwise. Returns the updated row.
 */
export async function updateVersioned<T extends VersionedTable>(
  tx: Pick<Tx, "update">,
  table: T,
  expected: Expected,
  values: PgUpdateSetSource<T>,
): Promise<T["$inferSelect"]> {
  const set = { ...values, version: sql`${table.version} + 1` } as PgUpdateSetSource<T>;
  const rows: T["$inferSelect"][] = await tx
    .update(table)
    .set(set)
    .where(and(eq(table.id, expected.id), eq(table.version, expected.version)))
    .returning();
  const [row] = rows;
  if (!row) throw new VersionConflictError(getTableName(table), expected.id);
  return row;
}

/**
 * Loads a row for an update and checks its version up front, so the audit
 * `before` snapshot is the row the user actually edited. The guarded UPDATE
 * in `updateVersioned` stays the real protection against races.
 */
export async function loadVersioned<T extends VersionedTable>(
  tx: Pick<Tx, "select">,
  table: T,
  expected: Expected,
): Promise<T["$inferSelect"]> {
  const rows = (await tx
    .select()
    .from(table as PgTable)
    .where(eq(table.id, expected.id))) as T["$inferSelect"][];
  const [row] = rows;
  if (!row || (row as { version: number }).version !== expected.version) {
    throw new VersionConflictError(getTableName(table), expected.id);
  }
  return row;
}
