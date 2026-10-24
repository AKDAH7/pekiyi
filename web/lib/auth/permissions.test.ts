import { describe, expect, it } from "vitest";

import { can, isRole, ROLES, roles, statements, type Resource } from "./permissions";

const APP_RESOURCES = [
  "users",
  "auditLog",
  "customers",
  "catalog",
  "orders",
  "proformas",
  "production",
  "loading",
  "labels",
  "prices",
  "orderPrices",
  "settings",
] as const satisfies readonly Resource[];

const BUSINESS_RESOURCES = [
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

    it("maintains customers but only admins delete them", () => {
      expect(can("export", "customers", "read")).toBe(true);
      expect(can("export", "customers", "create")).toBe(true);
      expect(can("export", "customers", "update")).toBe(true);
      expect(can("export", "customers", "delete")).toBe(false);
      expect(can("admin", "customers", "delete")).toBe(true);
    });

    it("reads, creates and updates the catalog but never deletes from it", () => {
      expect(can("export", "catalog", "read")).toBe(true);
      expect(can("export", "catalog", "create")).toBe(true);
      expect(can("export", "catalog", "update")).toBe(true);
      expect(can("export", "catalog", "delete")).toBe(false);
    });

    it("sees catalog prices and rates but cannot change them", () => {
      expect(can("export", "prices", "read")).toBe(true);
      expect(can("export", "prices", "update")).toBe(false);
    });

    it("sets sale prices on orders (line/piece price, discount, advance)", () => {
      expect(can("export", "orderPrices", "update")).toBe(true);
      expect(can("admin", "orderPrices", "update")).toBe(true);
    });

    it("moves order statuses forward only; stepping back is admin-only", () => {
      expect(can("export", "orders", "revertStatus")).toBe(false);
      expect(can("admin", "orders", "revertStatus")).toBe(true);
    });

    it("has no access to company settings, bank accounts or rate entry", () => {
      for (const action of statements.settings) expect(can("export", "settings", action)).toBe(false);
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
      expect(can("production", "orderPrices", "update")).toBe(false);
      expect(granted("production", "orderPrices")).toEqual([]);
    });

    it("has no access to customers, catalog, orders, settings, proformas, users or the audit log", () => {
      for (const resource of ["customers", "catalog", "orders", "proformas", "settings"] as const) {
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
