/**
 * IBAN checks (ISO 13616): country-specific length plus the mod-97 checksum.
 * Stored without spaces in upper case; shown in groups of four.
 */

/** IBAN length per country, for the countries we and our customers bank in. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AE: 23, AT: 20, BE: 16, BG: 22, BH: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  EG: 29, ES: 24, FI: 18, FR: 27, GB: 22, GE: 22, GR: 27, HR: 21, HU: 28, IE: 22, IQ: 23,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LT: 20, LU: 20, LV: 21, LY: 25, ME: 22, MK: 19,
  MT: 31, NL: 18, NO: 15, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SE: 24,
  SI: 19, SK: 24, TN: 24, TR: 26, UA: 29, XK: 20,
};

/** " tr42 0020 ..." → "TR420020...". */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/** Remainder of a long digit string mod 97, computed piecewise (no BigInt needed). */
function mod97(digits: string): number {
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97;
  }
  return remainder;
}

/** Accepts spaced or lower-case input; checks length (when the country is known) and checksum. */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expectedLength = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expectedLength !== undefined && iban.length !== expectedLength) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  return mod97(digits) === 1;
}

/** "TR420020..." → "TR42 0020 ...". */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");
}
