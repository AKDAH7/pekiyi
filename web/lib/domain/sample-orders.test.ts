import { describe, expect, it } from "vitest";

import { catalogFromSeed, loadSeedData, sampleOrderToDomain } from "@/db/seed/data";

import { computeLabelCount } from "./labels";
import { computePieceCounts, countByPieceType } from "./piece-counts";
import { computeOrderTotals } from "./totals";

const data = loadSeedData();
const catalog = catalogFromSeed(data);

function sample(number: string) {
  const order = data.sampleOrders.find((entry) => entry.number === number);
  if (!order) throw new Error(`sample order ${number} missing from the seed JSON`);
  const domain = sampleOrderToDomain(order);
  return {
    order,
    domain,
    totals: computeOrderTotals(domain, catalog),
    counts: computePieceCounts(domain),
  };
}

const money = (value: number) => value.toFixed(2);
const totalPieces = (counts: ReturnType<typeof computePieceCounts>) =>
  counts.reduce((acc, row) => acc + row.quantity, 0);

describe("sample order 261012-1ZOC (HALA, NL)", () => {
  const { order, domain, totals, counts } = sample("261012-1ZOC");

  it("matches the proforma total", () => {
    expect(totals.total).toBe(money(order.expected.total));
    expect(totals.lines.map((line) => line.lineTotal)).toEqual(["18200.00", "17500.00", "15400.00"]);
  });

  it("has no advance, so the balance is the full total", () => {
    expect(totals.advance).toBe("0.00");
    expect(totals.balance).toBe("51100.00");
  });

  it("counts 336 pieces", () => {
    expect(totalPieces(counts)).toBe(order.expected.pieces);
    expect(countByPieceType(counts)).toEqual({ SEAT_3: 168, SEAT_1: 168 });
    expect(computeLabelCount(domain, catalog)).toBe(336);
  });
});

describe("sample order 261010-1ZOC (JIAN, IQ) — per-piece prices", () => {
  const { order, totals, counts } = sample("261010-1ZOC");

  it("matches total and balance after the fixed 500 USD advance", () => {
    expect(totals.total).toBe(money(order.expected.total));
    expect(totals.advance).toBe("500.00");
    expect(totals.balance).toBe(money(order.expected.balance));
  });

  it("piece prices add up to every set price", () => {
    for (const line of totals.lines) {
      expect(line.piecePriceSum).toBe(line.unitPrice);
      expect(line.piecePriceMismatch).toBe(false);
    }
    expect(totals.lines.map((line) => line.unitPrice)).toEqual([
      ...Array(4).fill("840.00"),
      ...Array(4).fill("790.00"),
      ...Array(4).fill("740.00"),
    ]);
  });

  it("keeps one group per fabric colour", () => {
    expect(countByPieceType(counts)).toEqual({ SEAT_3: 24, SEAT_1: 48 });
    expect(counts).toContainEqual({
      model: "DAMLA",
      pieceType: "SEAT_1",
      fabrics: ["BOYTEKS 30147204 KAPUÇİNO"],
      quantity: 4,
    });
  });
});

describe("sample order 261020ZOC-REV1 (VIRONA, SE) — zero-price extra cushions", () => {
  const { order, domain, totals, counts } = sample("261020ZOC-REV1");

  it("matches total, advance and balance", () => {
    expect(totals.total).toBe(money(order.expected.total));
    expect(totals.advance).toBe(money(order.expected.advance));
    expect(totals.balance).toBe(money(order.expected.balance));
  });

  it("counts 30 sets with 60 three-seaters, 60 armchairs and 60 extra cushions", () => {
    const sets = domain.items.filter((line) => line.unit === "SET").reduce((acc, l) => acc + l.quantity, 0);
    expect(sets).toBe(order.expected.sets);
    const byType = countByPieceType(counts);
    expect(byType.SEAT_3).toBe(order.expected.seat3);
    expect(byType.SEAT_1).toBe(order.expected.seat1);
    expect(byType.CUSHION_EXTRA).toBe(order.expected.extraCushions);
    expect(computeLabelCount(domain, catalog)).toBe(180);
  });

  it("the cushions do not change any line price", () => {
    for (const line of totals.lines) expect(line.unitPrice).toBe("400.00");
  });
});

describe("sample order 261022ZOC-REV11 (GRAND DIZAJN, ME) — EUR column, CBM, model override", () => {
  const { order, domain, totals, counts } = sample("261022ZOC-REV11");

  it("matches the USD total", () => {
    expect(totals.total).toBe(money(order.expected.total));
    expect(totals.lines.map((line) => line.lineTotal)).toEqual(["1260.00", "2331.00", "2352.00"]);
  });

  it("matches the EUR total at 1.12 USD/EUR", () => {
    expect(totals.secondary?.currency).toBe("EUR");
    expect(totals.secondary?.total).toBe(money(order.expected.totalEur));
    expect(totals.lines.map((line) => line.secondaryLineTotal)).toEqual(["1125.00", "2081.25", "2100.00"]);
  });

  it("matches the total CBM", () => {
    expect(totals.totalCbm).toBe(order.expected.cbm.toFixed(3));
    expect(totals.linesMissingCbm).toBe(0);
  });

  it("computes the 30 % advance and the balance in both currencies", () => {
    expect(totals.advance).toBe("1782.90");
    expect(totals.balance).toBe("4160.10");
    expect(totals.secondary?.advance).toBe("1591.88");
    expect(totals.secondary?.balance).toBe("3714.37");
  });

  it("counts the VERA set's armchair as a DAMLA armchair", () => {
    const byType = countByPieceType(counts);
    expect(byType).toEqual({
      SEAT_3: order.expected.seat3,
      SEAT_2: order.expected.seat2,
      SEAT_1: order.expected.seat1,
    });
    expect(totalPieces(counts)).toBe(order.expected.pieces);
    expect(counts).toContainEqual({
      model: "DAMLA",
      pieceType: "SEAT_1",
      fabrics: ["BOYTEKS 30147203"],
      quantity: 5,
    });
    expect(counts.some((row) => row.model === "VERA" && row.pieceType === "SEAT_1")).toBe(false);
  });

  it("keeps both fabrics of a two-fabric line together", () => {
    expect(counts).toContainEqual({
      model: "SEREN",
      pieceType: "SEAT_3",
      fabrics: ["APOLLO 23", "APOLLO 21"],
      quantity: 10,
    });
    expect(computeLabelCount(domain, catalog)).toBe(46);
  });
});
