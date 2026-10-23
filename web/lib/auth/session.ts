import "server-only";

import { headers } from "next/headers";

import { auth, type Role } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Throws when there is no logged-in user — callers decide how to handle it. */
export async function requireUser() {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session.user;
}

/** Throws when there is no logged-in user, or they don't have one of `roles`. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as Role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
