import { sql, type SQL } from "drizzle-orm";
import { integer, numeric, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Languages every user-facing text is kept in (same set as the UI locales). */
export const DOC_LANGUAGES = ["tr", "en", "ar"] as const;
export type DocLanguage = (typeof DOC_LANGUAGES)[number];

/** A text kept in several languages; any language may be missing. */
export type LocalizedText = Partial<Record<DocLanguage, string>>;

/** Money: always numeric, never float. postgres-js returns it as a string. */
export const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
/** Exchange rates and other high-precision ratios. */
export const rate = (name: string) => numeric(name, { precision: 14, scale: 6 });
/** Volume in cubic metres. */
export const cbm = (name: string) => numeric(name, { precision: 8, scale: 3 });

/** ISO-4217 currency code (TRY, USD, EUR, ...). */
export const currency = (name: string) => text(name);

/**
 * created_at / updated_at / created_by / version — on every business table.
 * `version` drives optimistic locking: updates use
 * `WHERE id = $1 AND version = $2` and bump it by one.
 */
export const businessColumns = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  // Nullable: rows created by the seed script have no author.
  createdBy: text("created_by").references(() => user.id),
  version: integer("version").notNull().default(1),
});

/** `col IN ('a', 'b', ...)` for CHECK constraints on text "enum" columns. */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value.replace(/'/g, "''")}'`)),
    sql`, `,
  )})`;
}

export const currencyCheck = (column: AnyPgColumn): SQL => sql`${column} ~ '^[A-Z]{3}$'`;
