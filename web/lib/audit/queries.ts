import "server-only";

import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { auditLog, user } from "@/db/schema";

export const AUDIT_PAGE_SIZE = 25;

export type AuditListItem = {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string;
  /** Display name of the record, when the entity is one we can resolve. */
  entityLabel: string | null;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export async function listAuditLog(filters: { page: number; userId?: string; entity?: string }) {
  const actor = alias(user, "actor");
  const target = alias(user, "target");

  const conditions: SQL[] = [];
  if (filters.userId) conditions.push(eq(auditLog.userId, filters.userId));
  if (filters.entity) conditions.push(eq(auditLog.entity, filters.entity));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        entityLabel: target.name,
        actorName: actor.name,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .leftJoin(actor, eq(actor.id, auditLog.userId))
      .leftJoin(target, and(eq(auditLog.entity, "user"), eq(target.id, auditLog.entityId)))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((filters.page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);

  return {
    rows: rows satisfies AuditListItem[],
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

export async function listAuditFilterOptions() {
  const [users, entities] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.name)),
    db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity)),
  ]);
  return { users, entities: entities.map((row) => row.entity) };
}
