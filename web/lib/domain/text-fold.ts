/**
 * Turkish-aware case folding for search and duplicate detection, so
 * "ÖZBAY", "Özbay" and "ozbay" (or "İKLİM" / "iklim" / "IKLIM") match.
 * Plain `toLowerCase()` gets Turkish wrong ("İ" → "i̇", "I" → "i" instead
 * of "ı"), and people type these names without Turkish letters anyway.
 *
 * The same mapping runs in SQL (`translate()` then `lower()`, see
 * lib/customers/queries.ts), so a folded search term matches folded columns.
 */
export const FOLD_FROM = "İIıÖöÜüŞşÇçĞğÂâÎîÛû";
export const FOLD_TO = "iiioouussccggaaiiuu";

const FOLD_MAP = new Map([...FOLD_FROM].map((char, index) => [char, FOLD_TO[index]]));

/** Search folding: Turkish letters → ASCII, then lower case. Same as the SQL side. */
export function foldSearchText(value: string): string {
  let out = "";
  for (const char of value) out += FOLD_MAP.get(char) ?? char;
  return out.toLowerCase();
}

/** Stronger folding for comparisons: also drops every other accent. */
export function foldLetters(value: string): string {
  return foldSearchText(value).normalize("NFD").replace(/\p{M}/gu, "");
}
