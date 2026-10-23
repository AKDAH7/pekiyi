/** Keys that must never be written to the audit log, at any depth. */
const SECRET_KEY = /pass(word)?|hash|token|secret/i;

/**
 * Returns a JSON-safe copy of `value` with secret-looking keys removed and
 * dates turned into ISO strings. Defense in depth: callers should already
 * pass only the fields they want recorded.
 */
export function sanitizeForAudit(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SECRET_KEY.test(key) || inner === undefined) continue;
      result[key] = sanitizeForAudit(inner);
    }
    return result;
  }
  return value;
}

export type AuditDiffRow = {
  field: string;
  before: unknown;
  after: unknown;
  changed: boolean;
};

/** Field-by-field comparison of two audit snapshots, changed fields first. */
export function diffSnapshots(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditDiffRow[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const rows = [...fields].map((field) => {
    const b = before?.[field];
    const a = after?.[field];
    return { field, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
  return rows.sort((x, y) => Number(y.changed) - Number(x.changed));
}
