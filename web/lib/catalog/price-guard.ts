/**
 * Catalog price fields may only be written by roles with `prices.update`
 * (admin). Everyone else gets the same forms without the price inputs; if a
 * request still carries a price field — crafted by hand or replayed from an
 * admin's form — the action answers 403 instead of silently ignoring it.
 *
 * Pure (no `server-only`) so the rule is unit-tested.
 */
import { can } from "@/lib/auth/permissions";

/** Fields that set a price, per catalog table. */
export const PRICE_FIELDS = {
  modelPiecePrices: ["basePrice", "baseCurrency"],
  modelPresets: ["fixedPrice", "currency"],
} as const;

type PriceFieldOwner = keyof typeof PRICE_FIELDS;

/** Whether `input` carries any price field of `owner` (sent at all, even empty). */
export function carriesPriceFields(owner: PriceFieldOwner, input: Record<string, unknown>): boolean {
  return PRICE_FIELDS[owner].some((field) => input[field] !== undefined);
}

/** True when `role` may submit `rows`; false means the action must respond 403. */
export function mayWritePriceFields(
  role: string | null | undefined,
  owner: PriceFieldOwner,
  rows: readonly Record<string, unknown>[],
): boolean {
  return can(role, "prices", "update") || !rows.some((row) => carriesPriceFields(owner, row));
}
