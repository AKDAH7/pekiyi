import { effectiveModel, findCatalogPiece, type Catalog, type OrderForTotals } from "./types";

/** Check digit of the first 12 digits of an EAN-13 (weights 1,3,1,3,...). */
export function ean13CheckDigit(first12: string): number {
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (total % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Packages one piece ships in when the catalog says nothing: 1, except for
 * accessories without a catalog row, which travel inside another piece's
 * package (the extra cushion goes in its 3-seater's box) — 0.
 */
export function defaultPackageCount(pieceType: string, catalog?: Pick<Catalog, "accessoryPieceTypes">) {
  return catalog?.accessoryPieceTypes.includes(pieceType) ? 0 : 1;
}

/**
 * Labels to print for an order: Σ pieces × package count of that piece
 * (from the catalog row; `defaultPackageCount` when there is none). An
 * accessory that has its own box gets a catalog row with package_count ≥ 1.
 */
export function computeLabelCount(
  order: Pick<OrderForTotals, "items">,
  catalog?: Pick<Catalog, "pieces" | "accessoryPieceTypes">,
): number {
  let labels = 0;
  for (const line of order.items) {
    for (const piece of line.pieces) {
      const entry = catalog && findCatalogPiece(catalog, effectiveModel(line, piece), piece.pieceType);
      const packageCount = entry
        ? (entry.packageCount ?? 1)
        : defaultPackageCount(piece.pieceType, catalog);
      labels += line.quantity * piece.qtyPerUnit * packageCount;
    }
  }
  return labels;
}
