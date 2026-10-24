import { describe, expect, it } from "vitest";

import { buildHistory, filterEntry, splitChanges } from "./history";
import { nextIssueRevision } from "./issue";

describe("order history", () => {
  it("splits an audit diff into header and line changes", () => {
    const { header, lines } = splitChanges(
      { incoterm: "EXW", "#2 VERA": "VERA 3+1 · 5 SET", "#3 RİVA −": "RİVA 3 · 1 PCS", lineOrder: "1, 2" },
      { incoterm: "FOB", "#2 VERA": "VERA 3+1 · 6 SET", "#10 DAMLA +": "DAMLA 3+3+1+1 · 2 SET", lineOrder: "2, 1" },
    );
    expect(header).toEqual([{ field: "incoterm", before: "EXW", after: "FOB" }]);
    expect(lines.map((change) => `${change.change} ${change.label}`)).toEqual([
      "reordered ",
      "changed #2 VERA",
      "removed #3 RİVA",
      "added #10 DAMLA",
    ]);
  });

  it("merges audit entries and issued documents, newest first, without showing an issue twice", () => {
    const entries = buildHistory(
      [
        { id: "a1", createdAt: "2026-10-01T08:00:00Z", action: "create", actorName: "Ayşe", before: null, after: { currency: "USD", labelTemplate: null, "#1 VERA +": "VERA" } },
        { id: "a2", createdAt: "2026-10-02T08:00:00Z", action: "issue", actorName: "Ayşe", before: { number: "N", status: "offer" }, after: { number: "N", status: "proforma" } },
        { id: "a3", createdAt: "2026-10-03T08:00:00Z", action: "status_change", actorName: "Admin", before: { status: "confirmed" }, after: { status: "proforma", reason: "Wrong click" } },
        { id: "a4", createdAt: "2026-10-04T08:00:00Z", action: "update", actorName: "Ayşe", before: { incoterm: "EXW" }, after: { incoterm: "FOB" } },
      ],
      [{ id: "i1", docType: "proforma", number: "N", revision: 0, language: "en", issuedAt: "2026-10-02T08:00:00Z", issuedByName: "Ayşe" }],
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["edited", "status", "issue", "created"]);
    expect(entries[1].status).toEqual({ from: "confirmed", to: "proforma", note: null, reason: "Wrong click" });
    expect(entries[2].issue).toEqual({ document: "proforma", number: "N", revision: 0, language: "en" });
    expect(entries[2].status).toMatchObject({ from: "offer", to: "proforma" });
    expect(entries[3].lines[0]).toMatchObject({ change: "added", label: "#1 VERA" });
    // A new order lists only the fields it was created with.
    expect(entries[3].header).toEqual([{ field: "currency", before: null, after: "USD" }]);
  });

  it("filters by type and shows only the matching part of an entry", () => {
    const [entry] = buildHistory(
      [{ id: "a", createdAt: "2026-10-01T08:00:00Z", action: "update", actorName: null, before: { incoterm: "EXW" }, after: { incoterm: "FOB", "#1 X +": "X" } }],
      [],
    );
    expect(filterEntry(entry, "header")?.lines).toEqual([]);
    expect(filterEntry(entry, "lines")?.header).toEqual([]);
    expect(filterEntry(entry, "status")).toBeNull();
    expect(filterEntry(entry, "issues")).toBeNull();
    expect(filterEntry(entry, "all")).toBe(entry);
  });

  it("numbers issues: the first keeps the order's revision, later ones count up", () => {
    expect(nextIssueRevision(0, null)).toBe(0);
    expect(nextIssueRevision(11, null)).toBe(11);
    expect(nextIssueRevision(0, 0)).toBe(1);
    expect(nextIssueRevision(2, 2)).toBe(3);
  });
});
