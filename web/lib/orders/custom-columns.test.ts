import { describe, expect, it } from "vitest";

import type { CustomColumn } from "@/db/schema/orders";
import { createOrderSchema, saveColumnTemplateSchema } from "@/lib/validation/orders";

import { applyTemplateColumns, columnKeyFor, linesWithValue, pruneCustomValues } from "./custom-columns";
import { emptyLine, newId, toPayload, type EditorState } from "./editor";

const column = (key: string, type: CustomColumn["type"] = "text"): CustomColumn => ({
  key,
  label: { tr: key },
  type,
  showOn: ["proforma"],
});

describe("custom column keys", () => {
  it("come from the Turkish label, folded to ASCII", () => {
    expect(columnKeyFor({ tr: "Ayak Rengi", en: "Leg colour" }, [])).toBe("ayak_rengi");
    expect(columnKeyFor({ tr: "Kumaş Ölçüsü (cm)" }, [])).toBe("kumas_olcusu_cm");
  });

  it("are unique and always start with a letter", () => {
    expect(columnKeyFor({ tr: "Ayak" }, ["ayak", "ayak_2"])).toBe("ayak_3");
    expect(columnKeyFor({ tr: "2. kat" }, [])).toBe("col_2_kat");
    expect(columnKeyFor({ ar: "اللون" }, ["col"])).toBe("col_2");
  });
});

describe("custom values", () => {
  it("are dropped with their column, and empty ones too", () => {
    expect(pruneCustomValues({ legs: "GOLD", gone: "x", empty: "" }, [column("legs"), column("empty")])).toEqual({ legs: "GOLD" });
  });

  it("counts lines with a value, for the remove confirmation", () => {
    expect(linesWithValue([{ customValues: { a: "1" } }, { customValues: { a: "" } }, { customValues: {} }], "a")).toBe(1);
  });

  it("a template replaces the set; shared keys keep their values, others are reported", () => {
    const { columns, removed } = applyTemplateColumns([column("legs"), column("note")], [column("legs"), column("box", "number")]);
    expect(columns.map((entry) => entry.key)).toEqual(["legs", "box"]);
    expect(removed).toEqual(["note"]);
  });
});

describe("custom columns in the save payload", () => {
  const state: EditorState = {
    header: {
      customerId: newId(),
      orderDate: "2026-10-24",
      currency: "USD",
      secondaryCurrency: null,
      secondaryRate: "",
      incoterm: "EXW",
      deliveryTime: null,
      paymentTerms: null,
      advanceMode: "none",
      advanceValue: "",
      customerNotes: null,
      productionNotes: null,
      sampleApprovalRequired: false,
      sampleApprovalText: null,
      documentOptions: { showPiecePrices: false, showSecondaryCurrency: false, showCbm: false, showPhotos: false, bankOrderCurrencyOnly: false },
      labelBranding: null,
      labelTemplateId: null,
      customColumns: [column("legs"), column("boxes", "number")],
    },
    lines: [
      emptyLine({
        modelId: newId(),
        composition: "3",
        quantity: 1,
        customValues: { legs: "GOLD", boxes: "2.5", stale: "x" },
        pieces: [{ id: newId(), pieceTypeId: newId(), qtyPerUnit: 1, modelOverrideId: null, fabricOverrideId: null, unitPrice: "" }],
      }),
    ],
  };

  it("keeps values of the order's columns only", () => {
    const parsed = createOrderSchema.safeParse(toPayload(state, true));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.items[0].customValues).toEqual({ legs: "GOLD", boxes: "2.5" });
    expect(parsed.data?.header.customColumns.map((entry) => entry.key)).toEqual(["legs", "boxes"]);
  });

  it("rejects text in a number column, naming the cell", () => {
    const bad = { ...state, lines: [{ ...state.lines[0], customValues: { boxes: "two" } }] };
    const parsed = createOrderSchema.safeParse(toPayload(bad, true));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("items.0.customValues.boxes");
  });

  it("rejects duplicate keys and labels without Turkish", () => {
    const duplicate = { ...state, header: { ...state.header, customColumns: [column("a"), column("a")] } };
    expect(createOrderSchema.safeParse(toPayload(duplicate, true)).success).toBe(false);
    const english = { ...state, header: { ...state.header, customColumns: [{ ...column("a"), label: { en: "A" } }] } };
    expect(createOrderSchema.safeParse(toPayload(english, true)).success).toBe(false);
  });

  it("a template needs columns, and only a customer's template can be its default", () => {
    const base = { name: "Legs", customerId: newId(), columns: [column("legs")] };
    expect(saveColumnTemplateSchema.parse({ ...base, scope: "global", isDefault: true }).isDefault).toBe(false);
    expect(saveColumnTemplateSchema.parse({ ...base, scope: "customer", isDefault: true }).isDefault).toBe(true);
    expect(saveColumnTemplateSchema.safeParse({ ...base, columns: [], scope: "global" }).success).toBe(false);
  });
});
