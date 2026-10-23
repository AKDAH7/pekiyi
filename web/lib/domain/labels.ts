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
 * Labels to print for an order: Σ pieces × package count of that piece
 * (from the catalog, default 1). Accessories count like any other piece; set
 * their package_count to 0 in the catalog if they ship inside another box.
 */
export function computeLabelCount(
  order: Pick<OrderForTotals, "items">,
  catalog?: Pick<Catalog, "pieces">,
): number {
  let labels = 0;
  for (const line of order.items) {
    for (const piece of line.pieces) {
      const entry = catalog && findCatalogPiece(catalog, effectiveModel(line, piece), piece.pieceType);
      const packageCount = entry?.packageCount ?? 1;
      labels += line.quantity * piece.qtyPerUnit * packageCount;
    }
  }
  return labels;
}
