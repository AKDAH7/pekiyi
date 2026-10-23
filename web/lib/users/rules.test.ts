import { describe, expect, it } from "vitest";

import { checkUserChange, type UserState } from "./rules";

const admin = (id: string, active = true): UserState => ({ id, role: "admin", active });

describe("checkUserChange — always at least one active admin", () => {
  it("blocks deactivating the only active admin", () => {
    expect(
      checkUserChange({
        actorId: "someone-else",
        before: admin("a1"),
        after: admin("a1", false),
        activeAdminIds: ["a1"],
      }),
    ).toBe("lastActiveAdmin");
  });

  it("blocks demoting the only active admin", () => {
    expect(
      checkUserChange({
        actorId: "someone-else",
        before: admin("a1"),
        after: { id: "a1", role: "export", active: true },
        activeAdminIds: ["a1"],
      }),
    ).toBe("lastActiveAdmin");
  });

  it("does not count deactivated admins as remaining", () => {
    // A deactivated admin "a2" exists but is not in activeAdminIds.
    expect(
      checkUserChange({
        actorId: "someone-else",
        before: admin("a1"),
        after: { id: "a1", role: "production", active: true },
        activeAdminIds: ["a1"],
      }),
    ).toBe("lastActiveAdmin");
  });

  it("allows demoting or deactivating an admin when another active admin remains", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a2"),
        after: { id: "a2", role: "production", active: true },
        activeAdminIds: ["a1", "a2"],
      }),
    ).toBeNull();
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a2"),
        after: admin("a2", false),
        activeAdminIds: ["a1", "a2"],
      }),
    ).toBeNull();
  });

  it("allows changes that don't touch admins", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: { id: "u1", role: "export", active: true },
        after: { id: "u1", role: "production", active: false },
        activeAdminIds: ["a1"],
      }),
    ).toBeNull();
  });

  it("allows reactivating an admin and creating users", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a2", false),
        after: admin("a2"),
        activeAdminIds: ["a1"],
      }),
    ).toBeNull();
    expect(
      checkUserChange({
        actorId: "a1",
        before: null,
        after: { id: "new", role: "export", active: true },
        activeAdminIds: ["a1"],
      }),
    ).toBeNull();
  });
});

describe("checkUserChange — self-protection", () => {
  it("an admin cannot deactivate themselves, even with other admins around", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a1"),
        after: admin("a1", false),
        activeAdminIds: ["a1", "a2"],
      }),
    ).toBe("cannotDeactivateSelf");
  });

  it("an admin cannot remove their own admin role, even with other admins around", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a1"),
        after: { id: "a1", role: "export", active: true },
        activeAdminIds: ["a1", "a2"],
      }),
    ).toBe("cannotRemoveOwnAdmin");
  });

  it("an admin can still edit their own other fields", () => {
    expect(
      checkUserChange({
        actorId: "a1",
        before: admin("a1"),
        after: admin("a1"),
        activeAdminIds: ["a1"],
      }),
    ).toBeNull();
  });
});
