/**
 * Single source of truth for roles and permissions.
 *
 * Built on Better Auth's access-control API, so the same role objects drive
 * both our own checks (`can`, `requirePermission`) and the admin plugin's
 * built-in endpoints. Pure module (no `server-only`) so it can be imported by
 * the seed script, unit tests, and — for display purposes only — client code.
 * Real enforcement always happens on the server via `requirePermission`.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const CRUD = ["read", "create", "update", "delete"] as const;

export const statements = {
  // Better Auth's own admin-plugin resources (`user`, `session`). Kept so its
  // endpoints keep working for the admin role; our app checks use `users`.
  ...defaultStatements,
  users: ["read", "create", "update", "deactivate", "resetPassword"],
  auditLog: ["read"],
  customers: CRUD,
  products: CRUD,
  orders: CRUD,
  proformas: CRUD,
  production: CRUD,
  loading: CRUD,
  labels: CRUD,
  // Separate resource so price fields can be hidden everywhere for roles
  // without `prices.read` (production must never see prices).
  prices: ["read", "update"],
} as const;

export const ac = createAccessControl(statements);

export const ROLES = ["admin", "export", "production"] as const;
export type Role = (typeof ROLES)[number];

export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    users: [...statements.users],
    auditLog: [...statements.auditLog],
    customers: [...CRUD],
    products: [...CRUD],
    orders: [...CRUD],
    proformas: [...CRUD],
    production: [...CRUD],
    loading: [...CRUD],
    labels: [...CRUD],
    prices: [...statements.prices],
  }),
  export: ac.newRole({
    customers: [...CRUD],
    products: [...CRUD],
    orders: [...CRUD],
    proformas: [...CRUD],
    production: [...CRUD],
    loading: [...CRUD],
    labels: [...CRUD],
    prices: ["read", "update"],
  }),
  production: ac.newRole({
    production: ["read"],
    loading: ["read", "update"],
    labels: ["read"],
  }),
} satisfies Record<Role, unknown>;

/** App resources (excludes Better Auth's internal `user`/`session`). */
export type Resource = Exclude<keyof typeof statements, keyof typeof defaultStatements>;
export type Action<R extends Resource> = (typeof statements)[R][number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(roles, value);
}

/** Whether `role` may perform `action` on `resource`. Unknown roles get nothing. */
export function can<R extends Resource>(
  role: string | null | undefined,
  resource: R,
  action: Action<R>,
): boolean {
  if (!isRole(role)) return false;
  // Same check `role.authorize({ [resource]: [action] })` performs, done as a
  // direct lookup so a generic resource/action pair typechecks without casts.
  const granted: { readonly [K in Resource]?: readonly string[] } = roles[role].statements;
  return granted[resource]?.includes(action) ?? false;
}
