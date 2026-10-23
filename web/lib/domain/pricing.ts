import { dec, Decimal, sum, toMoney, type DecimalInput } from "./decimal";
import { normalizeComposition } from "./composition";
import {
  effectiveModel,
  findCatalogPiece,
  type Catalog,
  type Currency,
  type OrderLine,
  type RatesToTry,
} from "./types";

function rateToTry(rates: RatesToTry, currency: Currency): Decimal | null {
  if (currency === "TRY") return new Decimal(1);
  const value = rates[currency];
  return value === undefined ? null : dec(value);
}

/**
 * Converts through TRY, because TRY is the currency users type rates against.
 * Null when a needed rate is missing.
 */
export function convert(
  amount: DecimalInput,
  from: Currency,
  to: Currency,
  rates: RatesToTry,
): Decimal | null {
  if (from === to) return dec(amount);
  const fromRate = rateToTry(rates, from);
  const toRate = rateToTry(rates, to);
  if (!fromRate || !toRate) return null;
  return dec(amount).times(fromRate).dividedBy(toRate);
}

/**
 * Catalog price suggestion for one unit of an order line, in
 * `targetCurrency`, rounded to 2 decimals. Only a suggestion: the price on
 * the order is always editable.
 *
 * - A preset with a fixed price for exactly this model + composition wins,
 *   unless a piece is swapped for another model's piece.
 * - Otherwise Σ (piece price × qty per unit), each piece priced from its
 *   effective model, summed in TRY and converted once.
 * - Accessories without a catalog price count as 0.
 * - Null when any other piece has no price, or a rate is missing.
 */
export function suggestUnitPrice(
  line: Pick<OrderLine, "model" | "composition" | "pieces">,
  catalog: Catalog,
  rates: RatesToTry,
  targetCurrency: Currency,
): string | null {
  const hasOverride = line.pieces.some(
    (piece) => piece.modelOverride && piece.modelOverride !== line.model,
  );

  if (line.composition && !hasOverride) {
    const wanted = normalizeComposition(line.composition);
    const preset = catalog.presets.find(
      (entry) =>
        entry.model === line.model &&
        entry.fixedPrice !== null &&
        normalizeComposition(entry.composition) === wanted,
    );
    if (preset && preset.fixedPrice !== null) {
      const converted = convert(preset.fixedPrice, preset.currency, targetCurrency, rates);
      return converted ? toMoney(converted) : null;
    }
  }

  const amountsInTry: Decimal[] = [];
  for (const piece of line.pieces) {
    const entry = findCatalogPiece(catalog, effectiveModel(line, piece), piece.pieceType);
    if (!entry || entry.basePrice === null) {
      if (catalog.accessoryPieceTypes.includes(piece.pieceType)) continue;
      return null;
    }
    const inTry = convert(entry.basePrice, entry.baseCurrency, "TRY", rates);
    if (!inTry) return null;
    amountsInTry.push(inTry.times(piece.qtyPerUnit));
  }

  const converted = convert(sum(amountsInTry), "TRY", targetCurrency, rates);
  return converted ? toMoney(converted) : null;
}
