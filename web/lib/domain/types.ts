/**
 * Plain-data shapes the domain functions work on. They mirror the DB tables
 * but reference models / piece types / fabrics by code or label instead of
 * id, so the functions stay pure and easy to test. Callers (server code)
 * map DB rows into these.
 */
import type { DecimalInput } from "./decimal";

export type Currency = string;

export type OrderPiece = {
  /** Piece type code: SEAT_3, SEAT_1, CUSHION_EXTRA, ... */
  pieceType: string;
  qtyPerUnit: number;
  /** Model code when this piece is of another model (VERA set with a DAMLA armchair). */
  modelOverride?: string | null;
  /** Per-piece price, only with per-piece pricing. */
  unitPrice?: DecimalInput | null;
  /** Fabric label when this piece differs from the line's fabrics. */
  fabric?: string | null;
};

export type OrderLine = {
  /** Model code. */
  model: string;
  composition?: string | null;
  quantity: number;
  unit: "SET" | "PCS";
  unitPrice?: DecimalInput | null;
  discountPercent?: DecimalInput | null;
  /** Line-level override; otherwise derived from the catalog. */
  unitCbm?: DecimalInput | null;
  pieces: OrderPiece[];
  /** Fabric labels in order ("APOLLO 23", "APOLLO 21"). */
  fabrics: string[];
};

export type OrderForTotals = {
  currency: Currency;
  secondaryCurrency?: Currency | null;
  /** Units of `currency` per 1 unit of `secondaryCurrency` (USD per EUR). */
  secondaryRate?: DecimalInput | null;
  advanceType?: "amount" | "percent" | null;
  advanceValue?: DecimalInput | null;
  items: OrderLine[];
};

export type CatalogPiece = {
  model: string;
  pieceType: string;
  basePrice: DecimalInput | null;
  baseCurrency: Currency;
  unitCbm?: DecimalInput | null;
  /** Packages (labels) per piece; missing = 1. */
  packageCount?: number | null;
};

export type CatalogPreset = {
  model: string;
  composition: string;
  fixedPrice: DecimalInput | null;
  currency: Currency;
};

export type Catalog = {
  pieces: CatalogPiece[];
  presets: CatalogPreset[];
  /** Piece type codes that are accessories (zero price when not priced). */
  accessoryPieceTypes: string[];
};

/** Rate to TRY per currency, as typed in for the day: { USD: 49, EUR: 55.8 }. */
export type RatesToTry = Record<Currency, DecimalInput>;

/** Model code a piece is actually built as. */
export function effectiveModel(line: Pick<OrderLine, "model">, piece: OrderPiece): string {
  return piece.modelOverride ?? line.model;
}

export function findCatalogPiece(
  catalog: Pick<Catalog, "pieces">,
  model: string,
  pieceType: string,
): CatalogPiece | undefined {
  return catalog.pieces.find((entry) => entry.model === model && entry.pieceType === pieceType);
}
