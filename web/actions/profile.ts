"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";

import { db } from "@/db";
import { account, user } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { logAudit } from "@/lib/audit";
import { getSession, requireUser } from "@/lib/auth/session";
import { fieldError, fieldErrorsFrom, formError, success, type FormState } from "@/lib/forms";
import { authContext, lockUser, revokeSessions, userAuditSnapshot } from "@/lib/users/server";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation/users";

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const me = await requireUser();

  const found = await db.transaction(async (tx) => {
    const before = await lockUser(tx, me.id);
    if (!before) return false;

    const [after] = await tx
      .update(user)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(user.id, me.id))
      .returning();
    await logAudit(tx, {
      userId: me.id,
      entity: "user",
      entityId: me.id,
      action: "update",
      before: userAuditSnapshot(before),
      after: userAuditSnapshot(after),
    });
    return true;
  });
  if (!found) return formError("userNotFound");

  // Switching language moves the user to the same page in the new locale.
  const locale = await getLocale();
  if (parsed.data.preferredLocale !== locale) {
    throw redirect({ href: "/settings/profile", locale: parsed.data.preferredLocale });
  }
  refresh();
  return success();
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const me = await requireUser();
  const { currentPassword, newPassword } = parsed.data;
  const { hashPassword, verifyPassword } = await authContext();
  const current = await getSession();

  const result = await db.transaction(async (tx) => {
    const [credential] = await tx
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(and(eq(account.userId, me.id), eq(account.providerId, "credential")))
      .for("update");
    if (!credential?.password) return "wrongPassword" as const;
    if (!(await verifyPassword(currentPassword, credential.password))) {
      return "wrongPassword" as const;
    }

    await tx
      .update(account)
      .set({ password: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(account.id, credential.id));
    // Sign out other devices; keep this session.
    await revokeSessions(tx, me.id, current?.session.token);
    await logAudit(tx, {
      userId: me.id,
      entity: "user",
      entityId: me.id,
      action: "password_change",
    });
    return "ok" as const;
  });

  if (result === "wrongPassword") return fieldError("currentPassword", "currentPasswordWrong");
  return success();
}
