import DecimalJs from "decimal.js";

/**
 * Decimal arithmetic for money, rates and volumes. Never use JS numbers for
 * these: 0.1 + 0.2 !== 0.3. Rounding is commercial (half away from zero).
 */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** What the DB driver (numeric → string) and the JSON fixtures (number) give us. */
export type DecimalInput = string | number | Decimal;

export function dec(value: DecimalInput): Decimal {
  return new Decimal(value);
}

export function decOrNull(value: DecimalInput | null | undefined): Decimal | null {
  return value === null || value === undefined ? null : new Decimal(value);
}

/** Money as the string we store in numeric(12,2) columns: "51100.00". */
export function toMoney(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}

/** Volume as stored in numeric(8,3) columns: "33.600". */
export function toCbm(value: Decimal): string {
  return value.toDecimalPlaces(3).toFixed(3);
}

export function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((acc, value) => acc.plus(value), new Decimal(0));
}
