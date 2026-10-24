/**
 * Locale-aware display and parsing of decimal values (money, rates, CBM).
 * Values travel as canonical decimal strings ("1250.00") — the same strings
 * Postgres numeric columns give us — and are only formatted for display, so
 * no JS float ever touches a stored amount. Pure: used by server and client.
 */

/**
 * Intl locale for numbers. Arabic is pinned to Latin digits: prices and
 * IBANs on our documents use them, and it keeps server and browser output
 * identical whatever ICU data each side ships.
 */
export function numberLocale(locale: string): string {
  return locale === "ar" ? "ar-u-nu-latn" : locale;
}

type DecimalFormat = { minimumFractionDigits?: number; maximumFractionDigits?: number };

/** "1250.5" → "1.250,50" (tr) / "1,250.50" (en). Null and "" → "". */
export function formatDecimal(
  value: string | null | undefined,
  locale: string,
  { minimumFractionDigits = 2, maximumFractionDigits = minimumFractionDigits }: DecimalFormat = {},
): string {
  if (value === null || value === undefined || value === "") return "";
  // Intl formats numeric *strings* exactly (no float conversion), so large or
  // long values keep every digit.
  const format = new Intl.NumberFormat(numberLocale(locale), {
    minimumFractionDigits,
    maximumFractionDigits: Math.max(minimumFractionDigits, maximumFractionDigits),
  });
  return format.format(value as Intl.StringNumericLiteral);
}

function separators(locale: string) {
  const parts = new Intl.NumberFormat(numberLocale(locale)).formatToParts(11111.5);
  return {
    group: parts.find((part) => part.type === "group")?.value ?? ",",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
}

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/**
 * What a user typed → canonical decimal string, or null if it isn't a number.
 * "1.250,50" (tr) → "1250.50", "1,250.50" (en) → "1250.50". Arabic-Indic
 * digits and separators are accepted too. A lone separator followed by
 * exactly three digits is a thousands separator only in the locale where it
 * groups ("1.250" is 1250 in tr, 1.25 in en).
 */
export function parseLocaleDecimal(text: string, locale: string): string | null {
  let value = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[٬\s  ']/g, ""); // Arabic thousands separator, spaces
  if (value === "") return null;

  const { group, decimal } = separators(locale);
  const groupParts = value.split(group);
  if (!value.includes(decimal) && groupParts.length === 2 && groupParts[1].length !== 3) {
    // "1250.5" typed in tr: one separator not followed by 3 digits can't be
    // grouping, so the user meant a decimal point.
    value = groupParts.join(".");
  } else {
    value = groupParts.join("");
  }
  if (decimal !== ".") value = value.replace(decimal, ".");
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;

  // Drop leading zeros ("007.5" → "7.5") but keep "0.5".
  return value.replace(/^(-?)0+(?=\d)/, "$1");
}
