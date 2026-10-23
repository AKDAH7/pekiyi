import { describe, expect, it } from "vitest";

import { diffSnapshots, sanitizeForAudit } from "./sanitize";

describe("sanitizeForAudit", () => {
  it("strips password, hash and token fields at any depth", () => {
    expect(
      sanitizeForAudit({
        name: "Ali",
        password: "secret123",
        nested: { passwordHash: "x", token: "y", keep: 1 },
      }),
    ).toEqual({ name: "Ali", nested: { keep: 1 } });
  });

  it("serializes dates", () => {
    expect(sanitizeForAudit({ at: new Date("2026-01-02T03:04:05.000Z") })).toEqual({
      at: "2026-01-02T03:04:05.000Z",
    });
  });
});

describe("diffSnapshots", () => {
  it("lists changed fields first", () => {
    const rows = diffSnapshots({ name: "A", role: "export" }, { name: "A", role: "admin" });
    expect(rows[0]).toEqual({ field: "role", before: "export", after: "admin", changed: true });
    expect(rows[1]?.changed).toBe(false);
  });

  it("handles creation (no before)", () => {
    expect(diffSnapshots(null, { name: "A" })).toEqual([
      { field: "name", before: undefined, after: "A", changed: true },
    ]);
  });
});
