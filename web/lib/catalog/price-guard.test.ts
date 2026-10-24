import { describe, expect, it } from "vitest";

import { formDataToObject } from "@/lib/form-data";
import { createPresetSchema, updatePiecesSchema, updatePresetSchema } from "@/lib/validation/catalog";

import { mayWritePriceFields } from "./price-guard";

const MODEL = "6a1c1f5e-3b0a-4c1e-9d55-0d4d9f0b8a11";
const PIECE = "7b2d2a6f-4c1b-4d2f-8e66-1e5e0a1c9b22";

/** Parses a request body exactly as the server action does. */
function piecesRequest(fields: Record<string, string>) {
  const form = new FormData();
  form.set("modelId", MODEL);
  form.set("pieces.0.pieceTypeId", PIECE);
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const parsed = updatePiecesSchema.safeParse(formDataToObject(form));
  if (!parsed.success) throw parsed.error;
  return parsed.data.pieces;
}

describe("price fields in the piece table", () => {
  it("lets export save packing data when no price field is sent", () => {
    const rows = piecesRequest({ "pieces.0.unitCbm": "0.8", "pieces.0.packageCount": "2" });
    expect(mayWritePriceFields("export", "modelPiecePrices", rows)).toBe(true);
  });

  it("refuses a crafted export request carrying a price", () => {
    const rows = piecesRequest({ "pieces.0.unitCbm": "0.8", "pieces.0.basePrice": "1.00" });
    expect(mayWritePriceFields("export", "modelPiecePrices", rows)).toBe(false);
  });

  it("refuses an export request that only clears a price or changes its currency", () => {
    expect(
      mayWritePriceFields("export", "modelPiecePrices", piecesRequest({ "pieces.0.basePrice": "" })),
    ).toBe(false);
    expect(
      mayWritePriceFields("export", "modelPiecePrices", piecesRequest({ "pieces.0.baseCurrency": "USD" })),
    ).toBe(false);
  });

  it("refuses a price hidden in a later row", () => {
    const rows = piecesRequest({
      "pieces.0.unitCbm": "0.8",
      "pieces.1.pieceTypeId": PIECE,
      "pieces.1.basePrice": "7750",
    });
    expect(mayWritePriceFields("export", "modelPiecePrices", rows)).toBe(false);
  });

  it("allows admins to write prices and never lets production", () => {
    const rows = piecesRequest({ "pieces.0.basePrice": "7750.00", "pieces.0.baseCurrency": "TRY" });
    expect(mayWritePriceFields("admin", "modelPiecePrices", rows)).toBe(true);
    expect(mayWritePriceFields("production", "modelPiecePrices", rows)).toBe(false);
    expect(mayWritePriceFields(undefined, "modelPiecePrices", rows)).toBe(false);
  });
});

describe("price fields in presets", () => {
  const base = { modelId: MODEL, composition: "3+3+1+1" };

  it("lets export add a composition without a fixed price", () => {
    const parsed = createPresetSchema.parse(base);
    expect(mayWritePriceFields("export", "modelPresets", [parsed])).toBe(true);
  });

  it("refuses a fixed price or currency from export", () => {
    const withPrice = createPresetSchema.parse({ ...base, fixedPrice: "610" });
    expect(mayWritePriceFields("export", "modelPresets", [withPrice])).toBe(false);
    const withCurrency = updatePresetSchema.parse({ ...base, id: PIECE, version: "3", currency: "EUR" });
    expect(mayWritePriceFields("export", "modelPresets", [withCurrency])).toBe(false);
    expect(mayWritePriceFields("admin", "modelPresets", [withPrice])).toBe(true);
  });
});
