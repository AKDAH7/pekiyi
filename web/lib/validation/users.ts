import { z } from "zod";

import { routing } from "@/i18n/routing";
import { ROLES } from "@/lib/auth/permissions";

// Error messages are translation keys under `validation.*` in messages/*.json;
// the server translates them into the user's language before returning them.

// Better Auth's default password length limits.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const name = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(100, { error: "tooLong" });

const email = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "tooLong" })
  .pipe(z.email({ error: "invalidEmail" }));

export const password = z
  .string({ error: "required" })
  .min(1, { error: "required" })
  .min(PASSWORD_MIN, { error: "passwordTooShort" })
  .max(PASSWORD_MAX, { error: "passwordTooLong" });

const role = z.enum(ROLES, { error: "invalidRole" });
const preferredLocale = z.enum(routing.locales, { error: "invalidLocale" });
const userId = z.string().min(1);

export const createUserSchema = z.object({ name, email, role, preferredLocale, password });

export const updateUserSchema = z.object({ userId, name, email, role, preferredLocale });

export const resetPasswordSchema = z.object({ userId, password });

export const setActiveSchema = z.object({ userId, active: z.enum(["true", "false"]) });

export const updateProfileSchema = z.object({ name, preferredLocale });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "required" }).min(1, { error: "required" }),
    newPassword: password,
    confirmPassword: z.string({ error: "required" }).min(1, { error: "required" }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "passwordsDontMatch",
  });

export const usersSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
});

export const auditSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  user: z.string().trim().max(100).optional().catch(undefined),
  entity: z.string().trim().max(100).optional().catch(undefined),
});
