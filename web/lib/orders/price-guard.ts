/**
 * Order sale prices (line/piece price, discount, advance) need
 * `orderPrices.update` (admin and export) — separate from `prices.update`,
 * which guards catalog prices and rates (lib/catalog/price-guard.ts). Roles
 * without it get the same editor with the price cells read-only and never
 * send price fields; a request that still carries one is answered with 403.
 * On save the server keeps the stored prices of their lines
 * (`keepStoredPrices`).
 *
 * Pure (no `server-only`) so the rule is unit-tested.
 */
import { can } from "@/lib/auth/permissions";

/** The price fields of the order save payload. */
type PricedPayload = {
  header: { advanceMode?: unknown; advanceValue?: unknown };
  items: { unitPrice?: unknown; discountPercent?: unknown; pieces: { unitPrice?: unknown }[] }[];
};

export function carriesOrderPriceFields(payload: PricedPayload): boolean {
  return (
    payload.header.advanceMode !== undefined ||
    payload.header.advanceValue !== undefined ||
    payload.items.some(
      (item) =>
        item.unitPrice !== undefined ||
        item.discountPercent !== undefined ||
        item.pieces.some((piece) => piece.unitPrice !== undefined),
    )
  );
}

/** True when `role` may submit `payload`; false means the action must respond 403. */
export function mayWriteOrderPrices(role: string | null | undefined, payload: PricedPayload): boolean {
  return can(role, "orderPrices", "update") || !carriesOrderPriceFields(payload);
}

type StoredPrices = {
  items: { id: string; unitPrice: string | null; discountPercent: string; pieces: { id: string; unitPrice: string | null }[] }[];
};

/**
 * Prices for a save without price fields: lines and pieces that already
 * existed keep their stored price, new ones (added, pasted or copied in the
 * grid) start without a price for an admin to fill in.
 */
export function keepStoredPrices<T extends { id: string; pieces: readonly { id: string }[] }>(
  items: readonly T[],
  stored: StoredPrices,
): (Omit<T, "unitPrice" | "discountPercent" | "pieces"> & {
  unitPrice: string | null;
  discountPercent: string;
  pieces: (T["pieces"][number] & { unitPrice: string | null })[];
})[] {
  const storedItems = new Map(stored.items.map((item) => [item.id, item]));
  const storedPieces = new Map(stored.items.flatMap((item) => item.pieces.map((piece) => [piece.id, piece.unitPrice])));
  return items.map((item) => {
    const before = storedItems.get(item.id);
    return {
      ...item,
      unitPrice: before?.unitPrice ?? null,
      discountPercent: before?.discountPercent ?? "0",
      pieces: item.pieces.map((piece) => ({ ...piece, unitPrice: storedPieces.get(piece.id) ?? null })),
    };
  });
}
