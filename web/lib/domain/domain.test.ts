import { describe, expect, it } from "vitest";

import { catalogFromSeed, loadSeedData, resolveFabric } from "@/db/seed/data";

import { formatComposition, normalizeComposition, parseComposition } from "./composition";
import { dec, toMoney } from "./decimal";
import { computeLabelCount, isValidEan13 } from "./labels";
import { nextOrderNumber, revisionNumber, stripRevision } from "./order-number";
import { suggestUnitPrice } from "./pricing";
import { computeOrderTotals } from "./totals";
import type { OrderLine } from "./types";

const data = loadSeedData();
const catalog = catalogFromSeed(data);
const rates = { USD: data.exchangeRate.USD_TRY, EUR: data.exchangeRate.EUR_TRY };

function line(model: string, composition: string, overrides: Record<string, string> = {}) {
  const parsed = parseComposition(composition);
  if (!parsed.ok) throw new Error(composition);
  return {
    model,
    composition,
    pieces: parsed.pieces.map(({ pieceType, qty }) => ({
      pieceType,
      qtyPerUnit: qty,
      modelOverride: overrides[pieceType] ?? null,
    })),
  };
}

describe("parseComposition / formatComposition", () => {
  it("parses a set per piece type", () => {
    expect(parseComposition("3+3+1+1")).toEqual({
      ok: true,
      pieces: [
        { pieceType: "SEAT_3", qty: 2 },
        { pieceType: "SEAT_1", qty: 2 },
      ],
    });
    expect(parseComposition("3+3+1+1+1+1")).toEqual({
      ok: true,
      pieces: [
        { pieceType: "SEAT_3", qty: 2 },
        { pieceType: "SEAT_1", qty: 4 },
      ],
    });
    expect(parseComposition(" 3 + 2 + 1 ")).toEqual({
      ok: true,
      pieces: [
        { pieceType: "SEAT_3", qty: 1 },
        { pieceType: "SEAT_2", qty: 1 },
        { pieceType: "SEAT_1", qty: 1 },
      ],
    });
    expect(parseComposition("3")).toEqual({ ok: true, pieces: [{ pieceType: "SEAT_3", qty: 1 }] });
  });

  it("rejects bad input", () => {
    expect(parseComposition("")).toEqual({ ok: false, error: { code: "empty" } });
    expect(parseComposition("3++1")).toEqual({ ok: false, error: { code: "empty_token" } });
    expect(parseComposition("3+4")).toEqual({ ok: false, error: { code: "unknown_token", token: "4" } });
    expect(parseComposition("3+x")).toEqual({ ok: false, error: { code: "unknown_token", token: "x" } });
  });

  it("formats back, larger pieces first, skipping accessories", () => {
    expect(
      formatComposition([
        { pieceType: "SEAT_1", qty: 2 },
        { pieceType: "SEAT_3", qty: 2 },
        { pieceType: "CUSHION_EXTRA", qty: 2 },
      ]),
    ).toBe("3+3+1+1");
    for (const text of ["3+3+1+1", "3+3+1+1+1+1", "3+2+1", "3"]) {
      const parsed = parseComposition(text);
      expect(parsed.ok && formatComposition(parsed.pieces)).toBe(text);
    }
    expect(normalizeComposition("1+3+1+3")).toBe("3+3+1+1");
  });
});

describe("suggestUnitPrice", () => {
  it("sums TRY piece prices and converts at the day's rate", () => {
    // 2 × 14850 + 2 × 5800 = 41300 TRY
    expect(suggestUnitPrice(line("DAMLA", "3+3+1+1"), catalog, rates, "TRY")).toBe("41300.00");
    expect(suggestUnitPrice(line("DAMLA", "3+3+1+1"), catalog, rates, "USD")).toBe("842.86"); // / 49
    expect(suggestUnitPrice(line("DAMLA", "3+3+1+1"), catalog, rates, "EUR")).toBe("740.14"); // / 55.8
  });

  it("uses a preset's fixed set price when there is one", () => {
    expect(suggestUnitPrice(line("KOTON", "3+3+1+1"), catalog, rates, "USD")).toBe("610.00");
    expect(suggestUnitPrice(line("KOTON", "1+1+3+3"), catalog, rates, "TRY")).toBe("29890.00");
    expect(suggestUnitPrice(line("KOTON", "3+3+1+1"), catalog, rates, "EUR")).toBe("535.66");
  });

  it("returns null when a piece has no price", () => {
    expect(suggestUnitPrice(line("EFSUN", "3+3+1+1"), catalog, rates, "USD")).toBeNull();
    // VERA has no 2-seater price.
    expect(
      suggestUnitPrice(line("VERA", "3+2+1", { SEAT_1: "DAMLA" }), catalog, rates, "USD"),
    ).toBeNull();
    // A preset's fixed price doesn't apply once a piece is swapped.
    expect(
      suggestUnitPrice(line("KOTON", "3+3+1+1", { SEAT_1: "DAMLA" }), catalog, rates, "USD"),
    ).toBeNull();
  });

  it("prices an overridden piece from its own model", () => {
    // MODA 3-seater 11550 + NİSAN armchair 4850 = 16400 TRY
    expect(suggestUnitPrice(line("MODA", "3+1", { SEAT_1: "NİSAN" }), catalog, rates, "USD")).toBe(
      "334.69",
    );
    expect(suggestUnitPrice(line("MODA", "3+1"), catalog, rates, "USD")).toBe("354.08");
  });

  it("treats unpriced accessories as free", () => {
    const withCushions: Pick<OrderLine, "model" | "composition" | "pieces"> = line("İKLİM", "3+3+1+1");
    withCushions.pieces.push({ pieceType: "CUSHION_EXTRA", qtyPerUnit: 2 });
    expect(suggestUnitPrice(withCushions, catalog, rates, "USD")).toBe("540.82");
  });

  it("returns null when a rate is missing", () => {
    expect(suggestUnitPrice(line("DAMLA", "3+3+1+1"), catalog, {}, "USD")).toBeNull();
  });
});

describe("computeOrderTotals", () => {
  it("has no float errors", () => {
    const totals = computeOrderTotals({
      currency: "USD",
      items: [
        { model: "X", quantity: 3, unit: "PCS", unitPrice: "0.10", pieces: [], fabrics: [] },
        { model: "X", quantity: 1, unit: "PCS", unitPrice: "0.20", pieces: [], fabrics: [] },
      ],
    });
    expect(totals.total).toBe("0.50");
    expect(toMoney(dec(0.1).plus(0.2))).toBe("0.30");
  });

  it("applies discounts and counts unpriced lines", () => {
    const totals = computeOrderTotals({
      currency: "USD",
      advanceType: "percent",
      advanceValue: 30,
      items: [
        { model: "X", quantity: 3, unit: "SET", unitPrice: "333.33", discountPercent: "10", pieces: [], fabrics: [] },
        { model: "X", quantity: 1, unit: "SET", unitPrice: null, pieces: [], fabrics: [] },
      ],
    });
    expect(totals.lines[0]?.lineTotal).toBe("899.99"); // 999.99 × 0.9 = 899.991
    expect(totals.lines[1]?.lineTotal).toBeNull();
    expect(totals.unpricedLines).toBe(1);
    expect(totals.total).toBe("899.99");
    expect(totals.advance).toBe("270.00"); // 269.997
    expect(totals.balance).toBe("629.99");
  });

  it("derives CBM from the catalog when the line has none", () => {
    const totals = computeOrderTotals(
      {
        currency: "USD",
        items: [
          {
            model: "SEREN",
            quantity: 4,
            unit: "PCS",
            unitPrice: 100,
            pieces: [{ pieceType: "SEAT_3", qtyPerUnit: 1 }],
            fabrics: [],
          },
          {
            model: "DAMLA",
            quantity: 1,
            unit: "SET",
            unitPrice: 100,
            pieces: [{ pieceType: "SEAT_3", qtyPerUnit: 2 }],
            fabrics: [],
          },
        ],
      },
      catalog,
    );
    expect(totals.lines[0]?.unitCbm).toBe("0.800");
    expect(totals.totalCbm).toBe("3.200");
    expect(totals.linesMissingCbm).toBe(1);
  });
});

describe("order numbers", () => {
  it("numbers orders per day starting at 1", () => {
    expect(nextOrderNumber("2026-10-12", [], "ZOC")).toBe("261012-1ZOC");
    expect(nextOrderNumber("2026-10-12", ["261012-1ZOC"], "ZOC")).toBe("261012-2ZOC");
  });

  it("counts a day's orders whatever their code", () => {
    const first = nextOrderNumber("2026-10-23", [], "ZOC");
    // The company code changes in settings; existing orders keep theirs.
    const second = nextOrderNumber("2026-10-23", [first], "KAY");
    expect(first).toBe("261023-1ZOC");
    expect(second).toBe("261023-2KAY");
    expect(nextOrderNumber("2026-10-23", [first, second], "KAY")).toBe("261023-3KAY");
  });

  it("does not alter existing numbers when the code setting changes", () => {
    const existing = ["261023-1ZOC", "261023-2ZOC-REV3"];
    const snapshot = [...existing];
    nextOrderNumber("2026-10-23", existing, "NEW");
    expect(existing).toEqual(snapshot);
    // Revisions keep the original order's code.
    expect(revisionNumber(stripRevision("261023-2ZOC-REV3"), 4)).toBe("261023-2ZOC-REV4");
  });

  it("ignores revisions and still counts numbers typed outside the pattern", () => {
    expect(nextOrderNumber("2026-10-22", ["261022ZOC", "261022ZOC-REV11"], "ZOC")).toBe("261022-2ZOC");
    expect(nextOrderNumber("2026-10-12", ["261012-5ZOC", "261012-5ZOC-REV1"], "ZOC")).toBe("261012-6ZOC");
  });

  it("follows a configured pattern", () => {
    expect(nextOrderNumber("2026-10-12", ["PK-2026-10-12/1"], "", { pattern: "PK-{YYYY}-{MM}-{DD}/{SEQ}{CODE}" })).toBe(
      "PK-2026-10-12/2",
    );
  });

  it("rejects codes that would merge with the sequence", () => {
    expect(() => nextOrderNumber("2026-10-12", [], "1ZOC")).toThrow();
    expect(() => nextOrderNumber("2026-13", [], "ZOC")).toThrow();
  });

  it("builds revision numbers", () => {
    expect(revisionNumber("261022ZOC", 0)).toBe("261022ZOC");
    expect(revisionNumber("261022ZOC", 11)).toBe("261022ZOC-REV11");
    expect(revisionNumber("261022ZOC", 2, "/R{N}")).toBe("261022ZOC/R2");
    expect(stripRevision("261022ZOC-REV11")).toBe("261022ZOC");
    expect(() => revisionNumber("261022ZOC", -1)).toThrow();
  });
});

describe("isValidEan13", () => {
  const valid = ["9991003260502", "8690082964820"];

  it("accepts real barcodes from our labels", () => {
    for (const code of valid) expect(isValidEan13(code)).toBe(true);
  });

  it("rejects any single changed digit", () => {
    for (const code of valid) {
      for (let i = 0; i < code.length; i++) {
        for (let digit = 0; digit <= 9; digit++) {
          if (String(digit) === code[i]) continue;
          const changed = code.slice(0, i) + digit + code.slice(i + 1);
          expect(isValidEan13(changed), changed).toBe(false);
        }
      }
    }
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(isValidEan13("999100326050")).toBe(false);
    expect(isValidEan13("99910032605021")).toBe(false);
    expect(isValidEan13("999100326050a")).toBe(false);
  });
});

describe("computeLabelCount", () => {
  it("multiplies pieces by their package count, default 1", () => {
    const order = {
      items: [
        {
          model: "DAMLA",
          quantity: 2,
          unit: "SET" as const,
          fabrics: [],
          pieces: [
            { pieceType: "SEAT_3", qtyPerUnit: 2 },
            { pieceType: "SEAT_1", qtyPerUnit: 2 },
          ],
        },
      ],
    };
    expect(computeLabelCount(order)).toBe(8);
    const packed = {
      pieces: [{ model: "DAMLA", pieceType: "SEAT_3", basePrice: null, baseCurrency: "TRY", packageCount: 3 }],
    };
    expect(computeLabelCount(order, packed)).toBe(2 * 2 * 3 + 2 * 2);
  });
});

describe("resolveFabric", () => {
  it("matches catalog fabrics in order labels", () => {
    expect(resolveFabric("BOYTEKS 30147204 KAPUÇİNO", data.fabrics)).toMatchObject({ brand: "BOYTEKS", code: "30147204" });
    expect(resolveFabric("EMK 663 V04", data.fabrics)).toMatchObject({ brand: "EMK", code: "663 V04" });
    expect(resolveFabric("APOLLO 2", data.fabrics)).toBeNull();
  });
});
