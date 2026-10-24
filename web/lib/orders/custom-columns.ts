/**
 * Custom columns of an order (orders.custom_columns) and their values per
 * line (order_items.custom_values). Client-safe and pure: the "Columns"
 * menu, the grid and the save action share these.
 *
 * - A column's key is generated once from its first label and never
 *   changes, so renaming a column keeps its values.
 * - Values are strings: text as typed, numbers as canonical decimals
 *   ("12.5"), like every other decimal of the editor.
 */
import type { LocalizedText } from "@/db/schema/common";
import type { CustomColumn, CustomValues, DocumentTarget } from "@/db/schema/orders";
import { foldSearchText } from "@/lib/domain/text-fold";

export const MAX_CUSTOM_COLUMNS = 20;
export const CUSTOM_VALUE_MAX = 200;
export const CUSTOM_COLUMN_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const CUSTOM_COLUMN_TYPES = ["text", "number"] as const;
export const DOCUMENT_TARGET_LIST = ["proforma", "production", "loading"] as const satisfies readonly DocumentTarget[];

/** A key for a new column from its label ("Ayak rengi" → "ayak_rengi"), unique among `taken`. */
export function columnKeyFor(label: LocalizedText, taken: Iterable<string>): string {
  const source = label.tr || label.en || label.ar || "";
  const slug = foldSearchText(source)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  const base = /^[a-z]/.test(slug) ? slug : `col${slug ? `_${slug}` : ""}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const key = `${base}_${n}`;
    if (!used.has(key)) return key;
  }
}

function hasValue(value: CustomValues[string] | undefined): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** Lines that have a value in column `key`. */
export function linesWithValue(lines: readonly { customValues: CustomValues }[], key: string): number {
  return lines.filter((line) => hasValue(line.customValues[key])).length;
}

/**
 * Values kept for `columns`: values of removed columns are dropped, empty
 * ones too, so a saved line only carries what is shown.
 */
export function pruneCustomValues<V extends CustomValues[string]>(
  values: Readonly<Record<string, V>>,
  columns: readonly Pick<CustomColumn, "key">[],
): Record<string, V> {
  const keys = new Set(columns.map((column) => column.key));
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => keys.has(key) && hasValue(value)));
}

/**
 * Applying a template replaces the column set. Columns whose key is in both
 * keep their values; returns the keys of current columns that disappear.
 */
export function applyTemplateColumns(
  current: readonly CustomColumn[],
  template: readonly CustomColumn[],
): { columns: CustomColumn[]; removed: string[] } {
  const next = new Set(template.map((column) => column.key));
  return {
    columns: template.map((column) => ({ ...column, label: { ...column.label }, showOn: [...column.showOn] })),
    removed: current.filter((column) => !next.has(column.key)).map((column) => column.key),
  };
}
