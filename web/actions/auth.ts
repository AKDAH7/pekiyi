"use server";

import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { APIError } from "better-auth/api";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth/auth";

export type LoginFormState = {
  error?: "errorInvalidCredentials" | "errorDeactivated" | "errorGeneric";
};

const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "errorGeneric" };
  }

  let preferredLocale: string;
  try {
    const result = await auth.api.signInEmail({ body: parsed.data });
    preferredLocale = result.user.preferredLocale;
  } catch (error) {
    if (error instanceof APIError) {
      // Raised by the admin plugin for deactivated (banned) users.
      if (error.body?.code === "BANNED_USER") return { error: "errorDeactivated" };
      return { error: "errorInvalidCredentials" };
    }
    // Not a rejection from Better Auth itself (e.g. a bug in our own config) —
    // log the real cause server-side rather than showing a misleading message.
    console.error("Unexpected error during login:", error);
    return { error: "errorGeneric" };
  }

  // Land in the user's preferred language.
  const locale = hasLocale(routing.locales, preferredLocale) ? preferredLocale : await getLocale();
  throw redirect({ href: "/dashboard", locale });
}

export async function logoutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Redirect to login regardless of whether the server-side session could
    // be revoked (e.g. it already expired).
  }

  const locale = await getLocale();
  throw redirect({ href: "/login", locale });
}
