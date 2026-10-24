import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Extensible on purpose: new modules add actions here, no migration needed. */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "deactivate",
  "reactivate",
  "password_reset",
  "password_change",
  "status_change",
  "issue",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable for system-initiated changes (scripts, migrations). Users are
    // never deleted, so there is no cascade.
    userId: text("user_id").references(() => user.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").$type<AuditAction>().notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entity, table.entityId),
    index("audit_log_created_at_idx").on(table.createdAt),
  ],
);
