"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";

import { db } from "@/db";
import { account, user } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getSession, requirePermission } from "@/lib/auth/session";
import { fieldError, fieldErrorsFrom, formError, success, type FormState } from "@/lib/forms";
import { checkUserChange } from "@/lib/users/rules";
import {
  authContext,
  isUniqueViolation,
  lockActiveAdminIds,
  lockUser,
  revokeSessions,
  toUserState,
  userAuditSnapshot,
} from "@/lib/users/server";
import {
  createUserSchema,
  resetPasswordSchema,
  setActiveSchema,
  updateUserSchema,
} from "@/lib/validation/users";

/** Outcomes a transaction can end with besides success. */
type Failure =
  | { kind: "field"; field: string; key: string }
  | { kind: "form"; key: string };

async function toFormState(failure: Failure | null): Promise<FormState> {
  if (!failure) {
    refresh();
    return success();
  }
  return failure.kind === "field"
    ? fieldError(failure.field, failure.key)
    : formError(failure.key);
}

const EMAIL_TAKEN: Failure = { kind: "field", field: "email", key: "emailTaken" };
const NOT_FOUND: Failure = { kind: "form", key: "userNotFound" };

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("users", "create");

  const { password, ...data } = parsed.data;
  const { hashPassword, newId } = await authContext();
  const passwordHash = await hashPassword(password);
  const id = newId("user");

  try {
    const failure = await db.transaction(async (tx): Promise<Failure | null> => {
      const [existing] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, data.email));
      if (existing) return EMAIL_TAKEN;

      const [created] = await tx.insert(user).values({ id, ...data }).returning();
      await tx.insert(account).values({
        id: newId("account"),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: passwordHash,
      });
      await logAudit(tx, {
        userId: actor.id,
        entity: "user",
        entityId: id,
        action: "create",
        after: userAuditSnapshot(created),
      });
      return null;
    });
    return toFormState(failure);
  } catch (error) {
    if (isUniqueViolation(error)) return toFormState(EMAIL_TAKEN);
    throw error;
  }
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("users", "update");
  const { userId, ...data } = parsed.data;

  try {
    const failure = await db.transaction(async (tx): Promise<Failure | null> => {
      const activeAdminIds = await lockActiveAdminIds(tx);
      const before = await lockUser(tx, userId);
      if (!before) return NOT_FOUND;

      const violation = checkUserChange({
        actorId: actor.id,
        before: toUserState(before),
        after: { ...toUserState(before), role: data.role },
        activeAdminIds,
      });
      if (violation) return { kind: "field", field: "role", key: violation };

      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, data.email), ne(user.id, userId)));
      if (taken) return EMAIL_TAKEN;

      const [after] = await tx
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning();
      await logAudit(tx, {
        userId: actor.id,
        entity: "user",
        entityId: userId,
        action: "update",
        before: userAuditSnapshot(before),
        after: userAuditSnapshot(after),
      });
      return null;
    });
    return toFormState(failure);
  } catch (error) {
    if (isUniqueViolation(error)) return toFormState(EMAIL_TAKEN);
    throw error;
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("users", "resetPassword");
  const { userId, password } = parsed.data;

  const { hashPassword, newId } = await authContext();
  const passwordHash = await hashPassword(password);
  const current = await getSession();

  const failure = await db.transaction(async (tx): Promise<Failure | null> => {
    const target = await lockUser(tx, userId);
    if (!target) return NOT_FOUND;

    const updated = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: newId("account"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });
    }

    // Sign the user out everywhere — except the admin's own current session
    // if they reset their own password here.
    await revokeSessions(tx, userId, current?.session.token);
    await logAudit(tx, {
      userId: actor.id,
      entity: "user",
      entityId: userId,
      action: "password_reset",
    });
    return null;
  });
  return toFormState(failure);
}

/**
 * Deactivate / reactivate. Uses Better Auth's ban fields: its admin plugin
 * refuses to create a session for a banned user, so deactivated users can't
 * log in; their existing sessions are deleted in the same transaction.
 */
export async function setUserActiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("users", "deactivate");
  const { userId } = parsed.data;
  const active = parsed.data.active === "true";

  const failure = await db.transaction(async (tx): Promise<Failure | null> => {
    const activeAdminIds = await lockActiveAdminIds(tx);
    const before = await lockUser(tx, userId);
    if (!before) return NOT_FOUND;
    if (!before.banned === active) return null;

    const violation = checkUserChange({
      actorId: actor.id,
      before: toUserState(before),
      after: { ...toUserState(before), active },
      activeAdminIds,
    });
    if (violation) return { kind: "form", key: violation };

    const [after] = await tx
      .update(user)
      .set({
        banned: !active,
        banReason: active ? null : "deactivated",
        banExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning();
    if (!active) await revokeSessions(tx, userId);

    await logAudit(tx, {
      userId: actor.id,
      entity: "user",
      entityId: userId,
      action: active ? "reactivate" : "deactivate",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
    });
    return null;
  });
  return toFormState(failure);
}
