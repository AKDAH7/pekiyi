import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

import { auth } from "./auth";
import { can, type Action, type Resource, type Role } from "./permissions";

/** Deduplicated per request — layout, sidebar and page share one DB lookup. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Returns the logged-in user. With no valid session (missing, expired, or
 * revoked e.g. after deactivation) it redirects to the login page — that
 * works the same from pages, server actions and route handlers.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) {
    const locale = await getLocale();
    throw redirect({ href: "/login", locale });
  }
  return session.user;
}

/** Throws when there is no logged-in user, or they don't have one of `roles`. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.some((role) => role === user.role)) {
    forbidden();
  }
  return user;
}

/**
 * Returns the logged-in user if their role allows `action` on `resource`.
 * Otherwise calls Next's `forbidden()`, which renders the translated
 * "No permission" page (app/[locale]/(app)/forbidden.tsx) with a 403 — no
 * redirect. Use in every protected page, server action and route handler.
 */
export async function requirePermission<R extends Resource>(resource: R, action: Action<R>) {
  const user = await requireUser();
  if (!can(user.role, resource, action)) {
    forbidden();
  }
  return user;
}
