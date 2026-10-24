/**
 * Which stored files are still in use. A file is referenced when a table
 * column holds its key, or an issued document's snapshot mentions it
 * (snapshots are frozen, so a photo removed from the order later must
 * stay for the document). An image's variants (thumbnail, medium) are
 * referenced with it.
 *
 * Used by the orphan cleanup (scripts/files-cleanup.ts) and before the
 * actions delete a replaced/removed image. Takes the database handle as an
 * argument (not `server-only`), so vitest and the script can use it.
 */
import { isNotNull, sql } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  companySettings,
  customers,
  documentIssues,
  models,
  orderItems,
  orderReferenceNotes,
} from "@/db/schema";

import { isValidKey, mediumKey, thumbnailKey } from "./index";

/** Uploads younger than this are never orphans: they may belong to a form that isn't saved yet. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Every storage key found anywhere in `value` (strings, arrays, nested objects). */
export function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    if (isValidKey(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, into);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectKeys(entry, into);
  }
  return into;
}

/** True when `key` (an image or one of its variants: thumbnail, medium) belongs to a referenced image. */
export function isReferenced(key: string, referenced: ReadonlySet<string>): boolean {
  if (referenced.has(key)) return true;
  if (!key.includes(".thumb.") && !key.includes(".medium.")) return false;
  for (const image of referenced) if (thumbnailKey(image) === key || mediumKey(image) === key) return true;
  return false;
}

/** Files to delete: unreferenced and older than `minAgeMs`. */
export function findOrphans(
  files: readonly { key: string; modifiedAt: Date }[],
  referenced: ReadonlySet<string>,
  now: Date,
  minAgeMs = ORPHAN_MIN_AGE_MS,
): string[] {
  return files
    .filter((file) => now.getTime() - file.modifiedAt.getTime() >= minAgeMs && !isReferenced(file.key, referenced))
    .map((file) => file.key);
}

type Db = Pick<Tx, "select">;

/** Every key referenced by a table column or an issued document. */
export async function loadReferencedKeys(db: Db): Promise<Set<string>> {
  const [modelRows, customerRows, companyRows, itemRows, noteRows, issueRows] = await Promise.all([
    db.select({ key: models.mainPhotoPath }).from(models).where(isNotNull(models.mainPhotoPath)),
    db.select({ key: customers.logoPath }).from(customers).where(isNotNull(customers.logoPath)),
    db.select({ key: companySettings.logoPath }).from(companySettings).where(isNotNull(companySettings.logoPath)),
    db.select({ key: orderItems.photoPath }).from(orderItems).where(isNotNull(orderItems.photoPath)),
    db.select({ key: orderReferenceNotes.photoPath }).from(orderReferenceNotes).where(isNotNull(orderReferenceNotes.photoPath)),
    db.select({ snapshot: documentIssues.snapshot }).from(documentIssues),
  ]);
  const keys = new Set<string>();
  for (const row of [...modelRows, ...customerRows, ...companyRows, ...itemRows, ...noteRows]) {
    if (row.key) keys.add(row.key);
  }
  for (const row of issueRows) collectKeys(row.snapshot, keys);
  return keys;
}

/** Those of `keys` that an issued document's snapshot mentions. */
export async function keysInIssuedDocuments(db: Db, keys: readonly string[]): Promise<Set<string>> {
  const valid = keys.filter(isValidKey);
  if (valid.length === 0) return new Set();
  const rows = await db
    .select({ snapshot: documentIssues.snapshot })
    .from(documentIssues)
    .where(
      sql`${documentIssues.snapshot}::text like any (${sql`array[${sql.join(
        valid.map((key) => sql`${`%${key}%`}`),
        sql`, `,
      )}]`})`,
    );
  const found = new Set<string>();
  for (const row of rows) for (const key of collectKeys(row.snapshot)) if (valid.includes(key)) found.add(key);
  return found;
}
