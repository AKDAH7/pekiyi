import { describe, expect, it } from "vitest";

import { diffOrderSnapshots, type OrderAuditSnapshot } from "./audit-diff";
import { emptyLine, piecePriceTotal, toPayload, type EditorState } from "./editor";
import { carriesOrderPriceFields, keepStoredPrices, mayWriteOrderPrices } from "./price-guard";
import { createOrderSchema } from "../validation/orders";

const pieceTypes = [
  { id: "t3", code: "SEAT_3", seats: 3, isAccessory: false },
  { id: "t1", code: "SEAT_1", seats: 1, isAccessory: false },
  { id: "tc", code: "CUSHION_EXTRA", seats: 0, isAccessory: true },
];

const state: EditorState = {
  header: {
    customerId: "c",
    orderDate: "2026-10-24",
    currency: "USD",
    secondaryCurrency: null,
    secondaryRate: "1.12",
    incoterm: "EXW",
    deliveryTime: null,
    paymentTerms: null,
    advanceMode: "percent",
    advanceValue: "30",
    customerNotes: null,
    productionNotes: null,
    sampleApprovalRequired: false,
    sampleApprovalText: null,
    documentOptions: { showPiecePrices: false, showSecondaryCurrency: false, showCbm: false, showPhotos: false, bankOrderCurrencyOnly: false },
    labelBranding: null,
    labelTemplateId: null,
    customColumns: [],
  },
  lines: [
    emptyLine({
      id: "l1",
      modelId: "m",
      composition: "3+1",
      quantity: 2,
      unitPrice: "650.00",
      discountPercent: "5",
      pieces: [
        { id: "p1", pieceTypeId: "t3", qtyPerUnit: 1, modelOverrideId: null, fabricOverrideId: null, unitPrice: "400" },
        { id: "p2", pieceTypeId: "t1", qtyPerUnit: 1, modelOverrideId: null, fabricOverrideId: null, unitPrice: "" },
      ],
    }),
  ],
};

describe("toPayload", () => {
  it("sends every price field for admins", () => {
    const payload = toPayload(state, true);
    expect(payload.header.advanceMode).toBe("percent");
    expect(payload.header.advanceValue).toBe("30");
    expect(payload.items[0]).toMatchObject({ unitPrice: "650.00", discountPercent: "5" });
    expect(payload.items[0].pieces[0].unitPrice).toBe("400");
    // The rate only travels with a secondary currency.
    expect(payload.header.secondaryRate).toBe("");
    expect(carriesOrderPriceFields(payload)).toBe(true);
  });

  it("leaves price fields out entirely for roles that may not write them", () => {
    const payload = toPayload(state, false);
    expect("advanceMode" in payload.header).toBe(false);
    expect("unitPrice" in payload.items[0]).toBe(false);
    expect("discountPercent" in payload.items[0]).toBe(false);
    expect("unitPrice" in payload.items[0].pieces[0]).toBe(false);
    expect(carriesOrderPriceFields(payload)).toBe(false);
    expect(mayWriteOrderPrices("export", payload)).toBe(true);
  });
});

describe("the payload the editor sends", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const valid: EditorState = {
    header: { ...state.header, customerId: uuid(1) },
    lines: [
      {
        ...state.lines[0],
        id: uuid(2),
        modelId: uuid(3),
        fabrics: [{ fabricId: null, text: "NOT IN CATALOG 1" }],
        pieces: state.lines[0].pieces.map((piece, index) => ({ ...piece, id: uuid(10 + index), pieceTypeId: uuid(20 + index) })),
      },
    ],
  };

  it("passes the save schema, empty notes (null) included", () => {
    const parsed = createOrderSchema.safeParse(toPayload(valid, true));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.header.customerNotes).toBeNull();
    expect(parsed.data?.header.advanceMode).toBe("percent");
    expect(parsed.data?.items[0].fabrics).toEqual([{ fabricId: null, freeText: "NOT IN CATALOG 1" }]);
  });

  it("names the line of an unknown model and of a bad quantity", () => {
    const parsed = createOrderSchema.safeParse(
      toPayload({ ...valid, lines: [{ ...valid.lines[0], modelId: null, quantity: null }] }, true),
    );
    expect(parsed.success).toBe(false);
    const paths = parsed.error!.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
    expect(paths).toContain("items.0.modelId:modelRequired");
    expect(paths.some((path) => path.startsWith("items.0.quantity:"))).toBe(true);
  });
});

describe("order price rule", () => {
  it("lets admin and export (orderPrices.update) send prices, nobody else", () => {
    const priced = toPayload(state, true);
    expect(mayWriteOrderPrices("admin", priced)).toBe(true);
    expect(mayWriteOrderPrices("export", priced)).toBe(true);
    expect(mayWriteOrderPrices("production", priced)).toBe(false);
    expect(mayWriteOrderPrices(null, priced)).toBe(false);
  });

  it("an empty price field still counts as sent", () => {
    const payload = toPayload(state, false);
    payload.items[0].pieces[0].unitPrice = "";
    expect(mayWriteOrderPrices("production", payload)).toBe(false);
    expect(mayWriteOrderPrices("production", toPayload(state, false))).toBe(true);
  });

  it("keeps stored prices for existing lines and pieces; new ones start unpriced", () => {
    const stored = {
      items: [
        { id: "l1", unitPrice: "650.00", discountPercent: "5.00", pieces: [{ id: "p1", unitPrice: "400.00" }] },
      ],
    };
    const result = keepStoredPrices(
      [
        { id: "l1", pieces: [{ id: "p1" }, { id: "p-new" }] },
        { id: "l-new", pieces: [{ id: "p3" }] },
      ],
      stored,
    );
    expect(result[0]).toMatchObject({ unitPrice: "650.00", discountPercent: "5.00" });
    expect(result[0].pieces.map((piece) => piece.unitPrice)).toEqual(["400.00", null]);
    expect(result[1]).toMatchObject({ unitPrice: null, discountPercent: "0" });
  });
});

describe("piecePriceTotal", () => {
  it("sums piece prices × qty, skipping unpriced accessories", () => {
    const line = emptyLine({
      pieces: [
        { id: "a", pieceTypeId: "t3", qtyPerUnit: 2, modelOverrideId: null, fabricOverrideId: null, unitPrice: "250.10" },
        { id: "b", pieceTypeId: "t1", qtyPerUnit: 2, modelOverrideId: null, fabricOverrideId: null, unitPrice: "70" },
        { id: "c", pieceTypeId: "tc", qtyPerUnit: 2, modelOverrideId: null, fabricOverrideId: null, unitPrice: "" },
      ],
    });
    expect(piecePriceTotal(line, pieceTypes)).toBe("640.20");
  });

  it("is null while a main piece has no price", () => {
    expect(piecePriceTotal(state.lines[0], pieceTypes)).toBeNull();
    expect(piecePriceTotal(emptyLine(), pieceTypes)).toBeNull();
  });
});

describe("diffOrderSnapshots (audit)", () => {
  const before: OrderAuditSnapshot = {
    header: { number: "261024-1ZOC", status: "offer", deliveryTime: "EN: 2-3 WEEKS" },
    lines: [
      { id: "a", key: "#1 DAMLA", summary: "DAMLA 3+3+1+1 · 28 SET · 650.00" },
      { id: "b", key: "#2 VERA", summary: "VERA 3+3+1+1 · 28 SET · 625.00" },
      { id: "c", key: "#3 RİVA", summary: "RİVA 3+3+1+1 · 28 SET · 550.00" },
    ],
  };

  it("lists a new order's header and every line as added", () => {
    const diff = diffOrderSnapshots(null, before);
    expect(diff.before).toBeNull();
    expect(diff.after).toMatchObject({ number: "261024-1ZOC", "#1 DAMLA +": "DAMLA 3+3+1+1 · 28 SET · 650.00" });
  });

  it("records only what changed: header fields, changed, added and removed lines", () => {
    const after: OrderAuditSnapshot = {
      header: { number: "261024-1ZOC", status: "confirmed", deliveryTime: "EN: 2-3 WEEKS" },
      lines: [
        { id: "a", key: "#1 DAMLA", summary: "DAMLA 3+3+1+1 · 30 SET · 650.00" },
        { id: "c", key: "#2 RİVA", summary: "RİVA 3+3+1+1 · 28 SET · 550.00" },
        { id: "d", key: "#3 ZERDA", summary: "ZERDA 3+2+1 · 7 SET · 333.00" },
      ],
    };
    const diff = diffOrderSnapshots(before, after);
    expect(diff.before).toEqual({
      status: "offer",
      "#1 DAMLA": "DAMLA 3+3+1+1 · 28 SET · 650.00",
      "#2 VERA −": "VERA 3+3+1+1 · 28 SET · 625.00",
    });
    expect(diff.after).toEqual({
      status: "confirmed",
      "#1 DAMLA": "DAMLA 3+3+1+1 · 30 SET · 650.00",
      "#3 ZERDA +": "ZERDA 3+2+1 · 7 SET · 333.00",
    });
  });

  it("records a pure reordering once", () => {
    const after: OrderAuditSnapshot = { header: before.header, lines: [before.lines[1], before.lines[0], before.lines[2]] };
    const diff = diffOrderSnapshots(before, after);
    expect(diff.before).toEqual({ lineOrder: "DAMLA, VERA, RİVA" });
    expect(diff.after).toEqual({ lineOrder: "VERA, DAMLA, RİVA" });
  });
});
