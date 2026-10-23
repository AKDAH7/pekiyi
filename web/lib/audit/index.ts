import "server-only";

import type { Tx } from "@/db";
import { auditLog, type AuditAction } from "@/db/schema";

import { sanitizeForAudit } from "./sanitize";

export type AuditEntry = {
  /** The user performing the change; null for system-initiated changes. */
  userId: string | null;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

function snapshot(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const clean = sanitizeForAudit(value);
  return clean !== null && typeof clean === "object" && !Array.isArray(clean)
    ? Object.fromEntries(Object.entries(clean))
    : null;
}

/**
 * Records one change in `audit_log`. Must be called with the same transaction
 * that performs the change, so the log entry and the change commit (or roll
 * back) together. Every mutating server action goes through this helper.
 */
export async function logAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    userId: entry.userId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: snapshot(entry.before),
    after: snapshot(entry.after),
  });
}
