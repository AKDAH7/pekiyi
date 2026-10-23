/**
 * Order numbers: {YY}{MM}{DD}-{SEQ}{CODE}, e.g. 261012-1ZOC, and revisions
 * add a suffix: 261012-1ZOC-REV2. Pattern, revision suffix and code all come
 * from company settings; the code is passed in separately because each
 * order keeps the code it was created with.
 */

export const DEFAULT_ORDER_NUMBER_PATTERN = "{YY}{MM}{DD}-{SEQ}{CODE}";
export const DEFAULT_REVISION_SUFFIX = "-REV{N}";

/** Starts with a capital letter so it can't merge with the preceding SEQ digits. */
const ORDER_CODE_RE = /^(?:\p{Lu}[\p{Lu}\p{N}]*)?$/u;

export type OrderNumberOptions = {
  pattern?: string;
  revisionSuffix?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Order date must be YYYY-MM-DD, got "${date}"`);
  const [, yyyy, mm, dd] = match;
  return { YYYY: yyyy, YY: yyyy.slice(2), MM: mm, DD: dd };
}

export function isValidOrderCode(code: string): boolean {
  return ORDER_CODE_RE.test(code);
}

export function formatOrderNumber(
  pattern: string,
  values: { date: string; seq: number; code: string },
): string {
  const parts = dateParts(values.date);
  return pattern.replace(/\{(YYYY|YY|MM|DD|SEQ|CODE)\}/g, (_, token: string) => {
    if (token === "SEQ") return String(values.seq);
    if (token === "CODE") return values.code;
    return parts[token as keyof typeof parts];
  });
}

function revisionRegExp(revisionSuffix: string): RegExp {
  const [before, after = ""] = revisionSuffix.split("{N}");
  return new RegExp(`${escapeRegExp(before)}(\\d+)${escapeRegExp(after)}$`);
}

/** "261022ZOC-REV11" → "261022ZOC". */
export function stripRevision(number: string, revisionSuffix = DEFAULT_REVISION_SUFFIX): string {
  return number.replace(revisionRegExp(revisionSuffix), "");
}

/** SEQ of a number under `pattern` for `date`, whatever its code; null if it doesn't fit. */
function parseSeq(baseNumber: string, pattern: string, date: string): number | null {
  const parts = dateParts(date);
  let source = "";
  let hasSeq = false;
  for (const piece of pattern.split(/(\{(?:YYYY|YY|MM|DD|SEQ|CODE)\})/)) {
    if (piece === "{SEQ}") {
      source += "(\\d+)";
      hasSeq = true;
    } else if (piece === "{CODE}") source += "(?:\\p{Lu}[\\p{Lu}\\p{N}]*)?";
    else if (/^\{(YYYY|YY|MM|DD)\}$/.test(piece)) {
      source += escapeRegExp(parts[piece.slice(1, -1) as keyof typeof parts]);
    } else source += escapeRegExp(piece);
  }
  if (!hasSeq) return null;
  const match = new RegExp(`^${source}$`, "u").exec(baseNumber);
  return match ? Number(match[1]) : null;
}

/**
 * Number for a new order on `date`. SEQ counts every order of that day,
 * whatever code it was created with, and continues after the highest SEQ in
 * use. Numbers that don't follow the pattern (old ones typed by hand, like
 * "261020ZOC") still take up a SEQ each, so we never reuse one by accident.
 */
export function nextOrderNumber(
  date: string,
  existingNumbersThatDay: readonly string[],
  orderCode: string,
  options: OrderNumberOptions = {},
): string {
  const pattern = options.pattern ?? DEFAULT_ORDER_NUMBER_PATTERN;
  const revisionSuffix = options.revisionSuffix ?? DEFAULT_REVISION_SUFFIX;
  if (!isValidOrderCode(orderCode)) {
    throw new Error(`Invalid order code "${orderCode}": capital letters and digits, starting with a letter`);
  }

  const bases = new Set(existingNumbersThatDay.map((number) => stripRevision(number, revisionSuffix)));
  let highest = 0;
  for (const base of bases) highest = Math.max(highest, parseSeq(base, pattern, date) ?? 0);
  const seq = Math.max(highest, bases.size) + 1;

  return formatOrderNumber(pattern, { date, seq, code: orderCode });
}

/** Revision n of a base number; revision 0 is the base number itself. */
export function revisionNumber(
  baseNumber: string,
  n: number,
  revisionSuffix = DEFAULT_REVISION_SUFFIX,
): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Revision must be a whole number ≥ 0, got ${n}`);
  return n === 0 ? baseNumber : baseNumber + revisionSuffix.replace("{N}", String(n));
}
