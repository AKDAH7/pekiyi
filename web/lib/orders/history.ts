/**
 * The order's History tab: its audit entries (lib/orders/audit-diff.ts
 * writes them) and its issued documents, as one timeline, newest first.
 * Each entry is split into header changes, line changes, a status change
 * and/or an issue, so the tab can filter by type.
 *
 * Pure and client-safe; the page loads the rows (lib/orders/queries.ts).
 */
import type { OrderStatus } from "@/db/schema/orders";

export const HISTORY_FILTERS = ["all", "header", "lines", "status", "issues"] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

export type HistoryValue = string | number | boolean | null;

export type HeaderChange = { field: string; before: HistoryValue; after: HistoryValue };

export type LineChange = {
  change: "added" | "removed" | "changed" | "reordered";
  /** "#3 VERA"; empty for a reorder. */
  label: string;
  before: HistoryValue;
  after: HistoryValue;
};

export type HistoryEntry = {
  id: string;
  at: string;
  by: string | null;
  kind: "created" | "edited" | "status" | "issue";
  header: HeaderChange[];
  lines: LineChange[];
  status: { from: OrderStatus | null; to: OrderStatus; note: string | null; reason: string | null } | null;
  issue: { document: string; number: string; revision: number; language: string } | null;
  duplicatedFrom: string | null;
};

export type AuditRow = {
  id: string;
  createdAt: Date | string;
  action: string;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type IssueRow = {
  id: string;
  docType: string;
  number: string;
  revision: number;
  language: string;
  issuedAt: Date | string;
  issuedByName: string | null;
};

const ADDED = " +";
const REMOVED = " −";

function value(raw: unknown): HistoryValue {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  return JSON.stringify(raw);
}

const text = (raw: unknown): string | null => (typeof raw === "string" && raw !== "" ? raw : null);

/** Header and line changes of a create/update entry's before/after maps. */
export function splitChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const header: HeaderChange[] = [];
  const lines: LineChange[] = [];
  const keys = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])];
  for (const key of keys) {
    if (key === "duplicatedFrom") continue;
    const was = value(before?.[key]);
    const now = value(after?.[key]);
    if (key.endsWith(ADDED)) lines.push({ change: "added", label: key.slice(0, -ADDED.length), before: null, after: now });
    else if (key.endsWith(REMOVED)) lines.push({ change: "removed", label: key.slice(0, -REMOVED.length), before: was, after: null });
    else if (key === "lineOrder") lines.push({ change: "reordered", label: "", before: was, after: now });
    else if (key.startsWith("#")) lines.push({ change: "changed", label: key, before: was, after: now });
    else header.push({ field: key, before: was, after: now });
  }
  // Lines in their number order ("#2" before "#10"), additions/changes before removals.
  const lineNo = (label: string) => Number(/^#(\d+)/.exec(label)?.[1] ?? 0);
  lines.sort((a, b) => lineNo(a.label) - lineNo(b.label));
  return { header, lines };
}

const time = (at: Date | string) => (typeof at === "string" ? new Date(at) : at).toISOString();

/**
 * One timeline from the audit entries and the issued documents. Issues come
 * from document_issues; their audit entry ("issue") only adds the status
 * change an issue made (offer → proforma), so it isn't shown twice.
 */
export function buildHistory(audit: readonly AuditRow[], issues: readonly IssueRow[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const issueStatus = new Map<string, { from: OrderStatus; to: OrderStatus }>();

  for (const row of audit) {
    const base = { id: row.id, at: time(row.createdAt), by: row.actorName, status: null, issue: null, duplicatedFrom: null };
    if (row.action === "issue") {
      const number = text(row.after?.number);
      const from = text(row.before?.status);
      const to = text(row.after?.status);
      if (number && from && to) issueStatus.set(number, { from: from as OrderStatus, to: to as OrderStatus });
      continue;
    }
    if (row.action === "status_change") {
      const to = text(row.after?.status);
      if (!to) continue;
      entries.push({
        ...base,
        kind: "status",
        header: [],
        lines: [],
        status: {
          from: (text(row.before?.status) as OrderStatus | null) ?? null,
          to: to as OrderStatus,
          note: text(row.after?.note),
          reason: text(row.after?.reason),
        },
      });
      continue;
    }
    if (row.action !== "create" && row.action !== "update") continue;
    const { header, lines } = splitChanges(row.before, row.after);
    const created = row.action === "create";
    entries.push({
      ...base,
      kind: created ? "created" : "edited",
      // A new order lists what it was created with; empty fields say nothing.
      header: created ? header.filter((change) => change.after !== null && change.after !== "") : header,
      lines,
      duplicatedFrom: text(row.after?.duplicatedFrom),
    });
  }

  for (const issue of issues) {
    const status = issueStatus.get(issue.number);
    entries.push({
      id: issue.id,
      at: time(issue.issuedAt),
      by: issue.issuedByName,
      kind: "issue",
      header: [],
      lines: [],
      status: status ? { ...status, note: null, reason: null } : null,
      issue: { document: issue.docType, number: issue.number, revision: issue.revision, language: issue.language },
      duplicatedFrom: null,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** The parts of `entry` shown under `filter`; null when nothing of it is. */
export function filterEntry(entry: HistoryEntry, filter: HistoryFilter): HistoryEntry | null {
  switch (filter) {
    case "all":
      return entry;
    case "header":
      return entry.header.length > 0 ? { ...entry, lines: [], status: null, issue: null } : null;
    case "lines":
      return entry.lines.length > 0 ? { ...entry, header: [], status: null, issue: null } : null;
    case "status":
      return entry.status ? { ...entry, header: [], lines: [] } : null;
    case "issues":
      return entry.kind === "issue" ? entry : null;
  }
}
