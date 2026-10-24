import { describe, expect, it } from "vitest";

import { collectKeys, findOrphans, isReferenced, ORPHAN_MIN_AGE_MS } from "./references";

const PHOTO = "orders/0b6c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.jpg";
const PHOTO_THUMB = "orders/0b6c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.thumb.webp";
const PHOTO_MEDIUM = "orders/0b6c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.medium.jpg";
const LOGO = "company/11111111-2222-4333-8444-555555555555.png";
const LOGO_THUMB = "company/11111111-2222-4333-8444-555555555555.thumb.webp";
const ORPHAN = "models/99999999-8888-4777-8666-555555555555.webp";

describe("storage references", () => {
  it("finds keys anywhere in an issued snapshot, ignoring other strings", () => {
    const snapshot = {
      company: { logoPath: LOGO, legalName: "PEKİYİ" },
      order: { lines: [{ photoPath: PHOTO, model: "VERA" }, { photoPath: null }] },
      note: "orders/not-a-key.jpg",
    };
    expect([...collectKeys(snapshot)].sort()).toEqual([LOGO, PHOTO].sort());
  });

  it("a thumbnail and the medium variant are referenced together with their image", () => {
    const refs = new Set([PHOTO]);
    expect(isReferenced(PHOTO, refs)).toBe(true);
    expect(isReferenced(PHOTO_THUMB, refs)).toBe(true);
    expect(isReferenced(PHOTO_MEDIUM, refs)).toBe(true);
    expect(isReferenced(LOGO_THUMB, refs)).toBe(false);
  });

  it("orphans are unreferenced files older than 24 h", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const old = new Date(now.getTime() - ORPHAN_MIN_AGE_MS - 1);
    const fresh = new Date(now.getTime() - ORPHAN_MIN_AGE_MS + 60_000);
    const files = [
      { key: PHOTO, modifiedAt: old },
      { key: PHOTO_THUMB, modifiedAt: old },
      { key: PHOTO_MEDIUM, modifiedAt: old },
      { key: LOGO, modifiedAt: old },
      { key: LOGO_THUMB, modifiedAt: old },
      { key: ORPHAN, modifiedAt: old },
      // Just uploaded, form not saved yet: kept.
      { key: "orders/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png", modifiedAt: fresh },
    ];
    expect(findOrphans(files, new Set([PHOTO]), now).sort()).toEqual([LOGO, LOGO_THUMB, ORPHAN].sort());
  });
});
