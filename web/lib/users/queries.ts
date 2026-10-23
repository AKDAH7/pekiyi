import "server-only";

import { asc, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  preferredLocale: string;
  active: boolean;
  createdAt: Date;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listUsers(search?: string): Promise<UserListItem[]> {
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      preferredLocale: user.preferredLocale,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(pattern ? or(ilike(user.name, pattern), ilike(user.email, pattern)) : undefined)
    .orderBy(asc(user.name));
  return rows.map(({ banned, ...row }) => ({ ...row, active: !banned }));
}
