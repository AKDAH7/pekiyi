import "server-only";

import { and, eq, isNull, ne, or } from "drizzle-orm";

import type { Tx } from "@/db";
import { session, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth";
import { isRole, type Role } from "@/lib/auth/permissions";

import type { UserState } from "./rules";

type UserRow = typeof user.$inferSelect;

/** Fields recorded in the audit log for a user. Never includes credentials. */
export function userAuditSnapshot(row: UserRow) {
  return {
    name: row.name,
    email: row.email,
    role: row.role,
    preferredLocale: row.preferredLocale,
    active: !row.banned,
  };
}

export function toUserState(row: UserRow): UserState {
  // Unknown roles can't occur through the app; treat them as non-admin.
  const role: Role = isRole(row.role) ? row.role : "production";
  return { id: row.id, role, active: !row.banned };
}

const isActive = or(isNull(user.banned), eq(user.banned, false));

/**
 * Ids of all currently active admins, row-locked until the transaction ends
 * so two concurrent changes can't both remove "the other" last admin.
 */
export async function lockActiveAdminIds(tx: Tx): Promise<string[]> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), isActive))
    .for("update");
  return rows.map((row) => row.id);
}

/** Loads a user row and locks it for the rest of the transaction. */
export async function lockUser(tx: Tx, userId: string): Promise<UserRow | undefined> {
  const [row] = await tx.select().from(user).where(eq(user.id, userId)).for("update");
  return row;
}

/** Revokes a user's sessions, optionally keeping one (the caller's own). */
export async function revokeSessions(tx: Tx, userId: string, keepToken?: string) {
  await tx
    .delete(session)
    .where(
      keepToken
        ? and(eq(session.userId, userId), ne(session.token, keepToken))
        : eq(session.userId, userId),
    );
}

/** Better Auth's configured password hasher and id generator. */
export async function authContext() {
  const ctx = await auth.$context;
  return {
    hashPassword: (password: string) => ctx.password.hash(password),
    verifyPassword: (password: string, hash: string) => ctx.password.verify({ password, hash }),
    newId: (model: "user" | "account") => ctx.generateId({ model }) || crypto.randomUUID(),
  };
}

/** Postgres unique-constraint violation (also when wrapped by Drizzle). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Object; ) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
