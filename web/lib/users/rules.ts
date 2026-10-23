import type { Role } from "@/lib/auth/permissions";

export type UserState = {
  id: string;
  role: Role;
  active: boolean;
};

export type UserRuleViolation = "cannotDeactivateSelf" | "cannotRemoveOwnAdmin" | "lastActiveAdmin";

/**
 * Safety rules for changing a user's role or active status:
 * - an admin cannot deactivate themselves or remove their own admin role;
 * - the system must always keep at least one active admin.
 *
 * `before` is null when the user is being created. `activeAdminIds` are the
 * active admins as they are right now (read under a row lock on the server).
 */
export function checkUserChange(input: {
  actorId: string;
  before: UserState | null;
  after: UserState;
  activeAdminIds: readonly string[];
}): UserRuleViolation | null {
  const { actorId, before, after, activeAdminIds } = input;

  if (before && before.id === actorId) {
    if (before.active && !after.active) return "cannotDeactivateSelf";
    if (before.role === "admin" && after.role !== "admin") return "cannotRemoveOwnAdmin";
  }

  const remaining = new Set(activeAdminIds);
  if (before) remaining.delete(before.id);
  if (after.role === "admin" && after.active) remaining.add(after.id);

  return remaining.size === 0 ? "lastActiveAdmin" : null;
}
