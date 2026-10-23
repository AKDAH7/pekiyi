import { dec, decOrNull, Decimal, sum, toCbm, toMoney } from "./decimal";
import { effectiveModel, findCatalogPiece, type Catalog, type OrderForTotals, type OrderLine } from "./types";

export type LineTotals = {
  /** Effective unit price: the line price, or the sum of its piece prices. */
  unitPrice: string | null;
  /** Σ piece price × qty per unit, when every non-accessory piece has a price. */
  piecePriceSum: string | null;
  /** True when both a line price and piece prices exist and they disagree. */
  piecePriceMismatch: boolean;
  lineTotal: string | null;
  unitCbm: string | null;
  lineCbm: string | null;
  secondaryUnitPrice: string | null;
  secondaryLineTotal: string | null;
};

export type OrderTotals = {
  currency: string;
  lines: LineTotals[];
  total: string;
  advance: string;
  balance: string;
  /** Lines without a price; they count as 0 in `total`. */
  unpricedLines: number;
  secondary: {
    currency: string;
    rate: string;
    total: string;
    advance: string;
    balance: string;
  } | null;
  totalCbm: string;
  /** Lines whose CBM is unknown; they count as 0 in `totalCbm`. */
  linesMissingCbm: number;
};

function piecePriceSum(line: OrderLine, accessories: readonly string[]): Decimal | null {
  if (!line.pieces.some((piece) => piece.unitPrice !== null && piece.unitPrice !== undefined)) {
    return null;
  }
  const amounts: Decimal[] = [];
  for (const piece of line.pieces) {
    const price = decOrNull(piece.unitPrice);
    if (price === null) {
      if (accessories.includes(piece.pieceType)) continue;
      return null;
    }
    amounts.push(price.times(piece.qtyPerUnit));
  }
  return sum(amounts);
}

/** Line override, else Σ catalog piece CBM × qty (accessories may be missing). */
export function effectiveUnitCbm(line: OrderLine, catalog?: Catalog): Decimal | null {
  const override = decOrNull(line.unitCbm);
  if (override !== null) return override;
  if (!catalog) return null;
  const volumes: Decimal[] = [];
  for (const piece of line.pieces) {
    const entry = findCatalogPiece(catalog, effectiveModel(line, piece), piece.pieceType);
    const volume = decOrNull(entry?.unitCbm);
    if (volume === null) {
      if (catalog.accessoryPieceTypes.includes(piece.pieceType)) continue;
      return null;
    }
    volumes.push(volume.times(piece.qtyPerUnit));
  }
  return volumes.length > 0 ? sum(volumes) : null;
}

/**
 * All money and volume figures of an order. Each line total is rounded to
 * cents before summing, so the printed lines always add up to the printed
 * total. Secondary-currency figures are order-currency figures divided by
 * `secondaryRate` (USD per EUR).
 */
export function computeOrderTotals(order: OrderForTotals, catalog?: Catalog): OrderTotals {
  const accessories = catalog?.accessoryPieceTypes ?? [];
  const rate = decOrNull(order.secondaryRate);
  const secondary = order.secondaryCurrency && rate && !rate.isZero() ? rate : null;
  const toSecondary = (value: Decimal | null) =>
    value === null || secondary === null ? null : toMoney(value.dividedBy(secondary));

  const lineTotals: Decimal[] = [];
  const lineVolumes: Decimal[] = [];
  let unpricedLines = 0;
  let linesMissingCbm = 0;

  const lines = order.items.map((line): LineTotals => {
    const linePrice = decOrNull(line.unitPrice);
    const pieceSum = piecePriceSum(line, accessories);
    const unitPrice = linePrice ?? pieceSum;
    const discount = dec(line.discountPercent ?? 0);

    let lineTotal: Decimal | null = null;
    if (unitPrice === null) {
      unpricedLines++;
    } else {
      lineTotal = unitPrice
        .times(line.quantity)
        .times(new Decimal(100).minus(discount))
        .dividedBy(100)
        .toDecimalPlaces(2);
      lineTotals.push(lineTotal);
    }

    const unitCbm = effectiveUnitCbm(line, catalog);
    let lineCbm: Decimal | null = null;
    if (unitCbm === null) {
      linesMissingCbm++;
    } else {
      lineCbm = unitCbm.times(line.quantity);
      lineVolumes.push(lineCbm);
    }

    return {
      unitPrice: unitPrice === null ? null : toMoney(unitPrice),
      piecePriceSum: pieceSum === null ? null : toMoney(pieceSum),
      piecePriceMismatch: linePrice !== null && pieceSum !== null && !linePrice.equals(pieceSum),
      lineTotal: lineTotal === null ? null : toMoney(lineTotal),
      unitCbm: unitCbm === null ? null : toCbm(unitCbm),
      lineCbm: lineCbm === null ? null : toCbm(lineCbm),
      secondaryUnitPrice: toSecondary(unitPrice),
      secondaryLineTotal: toSecondary(lineTotal),
    };
  });

  const total = sum(lineTotals);
  const advanceValue = decOrNull(order.advanceValue);
  let advance = new Decimal(0);
  if (order.advanceType === "amount" && advanceValue) advance = advanceValue;
  if (order.advanceType === "percent" && advanceValue) {
    advance = total.times(advanceValue).dividedBy(100).toDecimalPlaces(2);
  }
  const balance = total.minus(advance);

  let secondaryTotals: OrderTotals["secondary"] = null;
  if (secondary !== null && order.secondaryCurrency) {
    const secondaryTotal = total.dividedBy(secondary).toDecimalPlaces(2);
    const secondaryAdvance = advance.dividedBy(secondary).toDecimalPlaces(2);
    secondaryTotals = {
      currency: order.secondaryCurrency,
      rate: secondary.toString(),
      total: toMoney(secondaryTotal),
      advance: toMoney(secondaryAdvance),
      // Derived from the rounded figures so advance + balance = total on paper.
      balance: toMoney(secondaryTotal.minus(secondaryAdvance)),
    };
  }

  return {
    currency: order.currency,
    lines,
    total: toMoney(total),
    advance: toMoney(advance),
    balance: toMoney(balance),
    unpricedLines,
    secondary: secondaryTotals,
    totalCbm: toCbm(sum(lineVolumes)),
    linesMissingCbm,
  };
}
