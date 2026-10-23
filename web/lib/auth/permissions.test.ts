import { describe, expect, it } from "vitest";

import { can, isRole, ROLES, roles, statements, type Resource } from "./permissions";

const APP_RESOURCES = [
  "users",
  "auditLog",
  "customers",
  "products",
  "orders",
  "proformas",
  "production",
  "loading",
  "labels",
  "prices",
] as const satisfies readonly Resource[];

const BUSINESS_RESOURCES = [
  "customers",
  "products",
  "orders",
  "proformas",
  "production",
  "loading",
  "labels",
] as const satisfies readonly Resource[];

/** Each role's granted actions, viewed as a plain string map for iteration. */
function granted(role: (typeof ROLES)[number], resource: Resource): readonly string[] {
  const map: { readonly [K in Resource]?: readonly string[] } = roles[role].statements;
  return map[resource] ?? [];
}

describe("permission map", () => {
  it("defines exactly the three app roles", () => {
    expect([...ROLES].sort()).toEqual(["admin", "export", "production"]);
    expect(Object.keys(roles).sort()).toEqual([...ROLES].sort());
  });

  it("rejects unknown roles", () => {
    expect(isRole("user")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(can("user", "customers", "read")).toBe(false);
    expect(can(null, "customers", "read")).toBe(false);
    expect(can("toString", "customers", "read")).toBe(false);
  });

  describe("admin", () => {
    it("can do everything on every app resource", () => {
      for (const resource of APP_RESOURCES) {
        expect([...granted("admin", resource)].sort()).toEqual([...statements[resource]].sort());
      }
      expect(can("admin", "users", "create")).toBe(true);
      expect(can("admin", "users", "deactivate")).toBe(true);
      expect(can("admin", "auditLog", "read")).toBe(true);
      expect(can("admin", "prices", "read")).toBe(true);
    });

    it("keeps Better Auth's admin-plugin permissions", () => {
      expect(roles.admin.authorize({ user: ["create", "ban", "set-password"] }).success).toBe(true);
    });
  });

  describe("export", () => {
    it("has full access to business resources", () => {
      for (const resource of BUSINESS_RESOURCES) {
        expect(can("export", resource, "read")).toBe(true);
        expect(can("export", resource, "create")).toBe(true);
        expect(can("export", resource, "update")).toBe(true);
        expect(can("export", resource, "delete")).toBe(true);
      }
    });

    it("can see prices", () => {
      expect(can("export", "prices", "read")).toBe(true);
    });

    it("has no access to users or the audit log", () => {
      for (const action of statements.users) expect(can("export", "users", action)).toBe(false);
      expect(can("export", "auditLog", "read")).toBe(false);
      expect(roles.export.authorize({ user: ["create"] }).success).toBe(false);
    });
  });

  describe("production", () => {
    it("can read production, loading and labels", () => {
      expect(can("production", "production", "read")).toBe(true);
      expect(can("production", "loading", "read")).toBe(true);
      expect(can("production", "labels", "read")).toBe(true);
    });

    it("can update loading (ticking loaded items) but nothing else", () => {
      expect(can("production", "loading", "update")).toBe(true);
      expect(can("production", "loading", "create")).toBe(false);
      expect(can("production", "loading", "delete")).toBe(false);
      expect(can("production", "production", "update")).toBe(false);
      expect(can("production", "labels", "update")).toBe(false);
    });

    it("never has any access to prices", () => {
      for (const action of statements.prices) {
        expect(can("production", "prices", action)).toBe(false);
      }
      expect(granted("production", "prices")).toEqual([]);
    });

    it("has no access to customers, products, orders, proformas, users or the audit log", () => {
      for (const resource of ["customers", "products", "orders", "proformas"] as const) {
        expect(can("production", resource, "read")).toBe(false);
      }
      expect(can("production", "users", "read")).toBe(false);
      expect(can("production", "auditLog", "read")).toBe(false);
    });
  });

  it("can() agrees with Better Auth's own authorize()", () => {
    for (const role of ROLES) {
      for (const resource of APP_RESOURCES) {
        for (const action of statements[resource]) {
          const viaBetterAuth = roles[role].authorize({ [resource]: [action] }).success;
          expect(granted(role, resource).includes(action)).toBe(viaBetterAuth);
        }
      }
    }
  });
});
