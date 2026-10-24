import { describe, expect, it } from "vitest";

import { loadSeedData, sampleOrderToDomain } from "@/db/seed/data";

import {
  autoUnit,
  matchFabric,
  matchModel,
  matrixLines,
  parsePastedLines,
  pieceTypeTotals,
} from "./order-lines";
import { computePieceCounts } from "./piece-counts";

const models = [
  { id: "m-damla", code: "DAMLA" },
  { id: "m-riva", code: "RİVA" },
  { id: "m-vera", code: "VERA" },
];
const fabrics = [
  { id: "f-202", brand: "BOYTEKS", code: "30147202" },
  { id: "f-204", brand: "BOYTEKS", code: "30147204" },
  { id: "f-emk", brand: "EMK", code: "663 V04" },
  { id: "f-emk-short", brand: "EMK", code: "663" },
  { id: "f-a21", brand: "APOLLO", code: "21" },
  { id: "f-a23", brand: "APOLLO", code: "23" },
];
const catalog = { models, fabrics };

describe("autoUnit", () => {
  it("is SET when a unit has more than one piece, PCS for a single piece", () => {
    expect(autoUnit("3+3+1+1")).toBe("SET");
    expect(autoUnit("3+1")).toBe("SET");
    expect(autoUnit("1+1")).toBe("SET");
    expect(autoUnit("3")).toBe("PCS");
    expect(autoUnit(" 1 ")).toBe("PCS");
  });

  it("gives no opinion on empty or unreadable compositions", () => {
    expect(autoUnit("")).toBeNull();
    expect(autoUnit(null)).toBeNull();
    expect(autoUnit("3+x")).toBeNull();
    expect(autoUnit("koltuk")).toBeNull();
  });
});

describe("matchModel / matchFabric", () => {
  it("matches model codes regardless of case and Turkish letters", () => {
    expect(matchModel("riva", models)?.id).toBe("m-riva");
    expect(matchModel("RIVA", models)?.id).toBe("m-riva");
    expect(matchModel(" Damla ", models)?.id).toBe("m-damla");
    expect(matchModel("DAMLAX", models)).toBeNull();
    expect(matchModel("", models)).toBeNull();
  });

  it("matches fabrics by brand + code, with or without the colour word, longest code first", () => {
    expect(matchFabric("BOYTEKS 30147204 KAPUÇİNO", fabrics)?.id).toBe("f-204");
    expect(matchFabric("boyteks 30147202", fabrics)?.id).toBe("f-202");
    expect(matchFabric("EMK 663 V04", fabrics)?.id).toBe("f-emk");
    expect(matchFabric("EMK 663 V99", fabrics)?.id).toBe("f-emk-short");
    expect(matchFabric("BOYTEKS 999", fabrics)).toBeNull();
  });
});

describe("parsePastedLines (Excel paste)", () => {
  it("turns tab-separated rows into lines, with locale-aware prices", () => {
    const text = "DAMLA\t3+3+1+1\tBOYTEKS 30147202\t28\t650\r\nriva\t3\tAPOLLO 23 / APOLLO 21\t10\t1.250,50\r\n";
    const { lines, skippedHeader } = parsePastedLines(text, catalog, "tr");
    expect(skippedHeader).toBe(false);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      row: 1,
      modelId: "m-damla",
      composition: "3+3+1+1",
      compositionValid: true,
      pieces: [
        { pieceType: "SEAT_3", qty: 2 },
        { pieceType: "SEAT_1", qty: 2 },
      ],
      fabrics: [{ text: "BOYTEKS 30147202", fabricId: "f-202" }],
      quantity: 28,
      unitPrice: "650",
      unit: "SET",
    });
    expect(lines[1]).toMatchObject({
      modelId: "m-riva",
      unit: "PCS",
      unitPrice: "1250.50",
      fabrics: [
        { text: "APOLLO 23", fabricId: "f-a23" },
        { text: "APOLLO 21", fabricId: "f-a21" },
      ],
    });
  });

  it("reads prices the English way in the en locale", () => {
    const { lines } = parsePastedLines("VERA\t3+2+1\tBOYTEKS 30147204\t5\t1,250.50", catalog, "en");
    expect(lines[0].unitPrice).toBe("1250.50");
  });

  it("keeps unknown models, fabrics and bad numbers — flagged, never dropped", () => {
    const text = [
      "GHOST\t3+3+1+1\tNOPE 1\t5\t600",
      "VERA\t3+x\tBOYTEKS 30147204\tfive\tabc",
      "DAMLA\t\t\t\t",
    ].join("\n");
    const { lines } = parsePastedLines(text, catalog, "en");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ modelText: "GHOST", modelId: null, fabrics: [{ text: "NOPE 1", fabricId: null }] });
    expect(lines[1]).toMatchObject({
      modelId: "m-vera",
      compositionValid: false,
      pieces: [],
      quantity: null,
      quantityText: "five",
      unitPrice: null,
      unitPriceText: "abc",
    });
    // An empty composition is allowed (filled in later), not an error.
    expect(lines[2]).toMatchObject({ modelId: "m-damla", composition: "", compositionValid: true, fabrics: [] });
  });

  it("skips a header row and numbers rows as in the pasted text", () => {
    const text = "Model\tSet\tFabric\tQty\tPrice\nDAMLA\t3+3+1+1\tBOYTEKS 30147202\t28\t650";
    const { lines, skippedHeader } = parsePastedLines(text, catalog, "en");
    expect(skippedHeader).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0].row).toBe(2);
  });

  it("understands Excel's quoted cells and ignores blank rows", () => {
    const text = 'DAMLA\t3+1\t"BOYTEKS 30147202\nBOYTEKS 30147204"\t2\t100\n\n\t\t\t\t\n';
    const { lines } = parsePastedLines(text, catalog, "en");
    expect(lines).toHaveLength(1);
    expect(lines[0].fabrics.map((fabric) => fabric.fabricId)).toEqual(["f-202", "f-204"]);
  });

  it("refuses zero / negative quantities and negative prices", () => {
    const { lines } = parsePastedLines("DAMLA\t3\tBOYTEKS 30147202\t0\t-5", catalog, "en");
    expect(lines[0].quantity).toBeNull();
    expect(lines[0].unitPrice).toBeNull();
  });
});

describe("matrixLines", () => {
  const colours = ["SETRA D-01", "SETRA D-02", "SETRA D-03", "SETRA D-04", "SETRA D-05", "SETRA D-06"].map(
    (text, index) => ({ text, fabricId: `f-${index}` }),
  );

  it("creates models × fabrics lines, model by model (the VİRONA order: 4 × 6)", () => {
    const lines = matrixLines({
      modelIds: ["a", "b", "c", "d"],
      fabrics: colours,
      composition: "3+3+1+1",
      quantity: 2,
    });
    expect(lines).toHaveLength(24);
    expect(lines.slice(0, 7).map((line) => [line.modelId, line.fabric.fabricId])).toEqual([
      ["a", "f-0"],
      ["a", "f-1"],
      ["a", "f-2"],
      ["a", "f-3"],
      ["a", "f-4"],
      ["a", "f-5"],
      ["b", "f-0"],
    ]);
    expect(lines.every((line) => line.quantity === 2 && line.unit === "SET")).toBe(true);
    expect(lines[0].pieces).toEqual([
      { pieceType: "SEAT_3", qty: 2 },
      { pieceType: "SEAT_1", qty: 2 },
    ]);
    // Each line gets its own pieces array (editing one never edits another).
    expect(lines[0].pieces).not.toBe(lines[1].pieces);
  });

  it("uses PCS for single pieces and rejects bad input", () => {
    expect(matrixLines({ modelIds: ["a"], fabrics: colours.slice(0, 1), composition: "3", quantity: 1 })[0].unit).toBe(
      "PCS",
    );
    expect(() => matrixLines({ modelIds: ["a"], fabrics: colours, composition: "3+y", quantity: 1 })).toThrow();
    expect(() => matrixLines({ modelIds: ["a"], fabrics: colours, composition: "3", quantity: 0 })).toThrow();
    expect(matrixLines({ modelIds: [], fabrics: colours, composition: "3", quantity: 1 })).toEqual([]);
  });
});

describe("pieceTypeTotals", () => {
  it("lists every piece type with zeros, as in the GRAND DIZAJN summary", () => {
    const data = loadSeedData();
    const grand = data.sampleOrders.find((order) => order.number === "261022ZOC-REV11")!;
    const totals = pieceTypeTotals(computePieceCounts(sampleOrderToDomain(grand)), [
      "SEAT_3",
      "SEAT_2",
      "SEAT_1",
      "CUSHION_EXTRA",
    ]);
    expect(totals).toEqual([
      { pieceType: "SEAT_3", quantity: 22 },
      { pieceType: "SEAT_2", quantity: 12 },
      { pieceType: "SEAT_1", quantity: 12 },
      { pieceType: "CUSHION_EXTRA", quantity: 0 },
    ]);
  });

  it("appends piece types the list doesn't know", () => {
    expect(pieceTypeTotals([{ model: "X", pieceType: "PUF", fabrics: [], quantity: 3 }], ["SEAT_3"])).toEqual([
      { pieceType: "SEAT_3", quantity: 0 },
      { pieceType: "PUF", quantity: 3 },
    ]);
  });
});
