/**
 * "Is this new customer one we already have?" — checked before saving a new
 * customer. A match on the same email, the same phone/WhatsApp number, or a
 * very similar company name is shown to the user, who decides whether to
 * save anyway (two shops of one owner may share a number). Pure, so the
 * rules are unit-tested.
 */
import { phoneDigits } from "./phone";
import { foldLetters } from "./text-fold";

export type DuplicateReason = "email" | "phone" | "name";

export type DuplicateCandidate = {
  companyName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type DuplicateMatch<T> = { customer: T; reasons: DuplicateReason[] };

/** Words that say what kind of company it is, not which one ("HALA FURNITURE" ≈ "Hala Mobilya"). */
const GENERIC_WORDS = new Set([
  "furniture", "furnitures", "mobilya", "mobilyacilik", "mobel", "meubles", "mobili", "home", "homes",
  "ltd", "limited", "llc", "inc", "co", "company", "corp", "sti", "as", "gmbh", "bv", "sarl", "srl",
  "trading", "trade", "group", "the",
]);

/** "ÖZBAY Mobilya Ltd. Şti." → "ozbay"; spaces, punctuation and legal-form words ignored. */
export function companyNameKey(name: string): string {
  const words = foldLetters(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const specific = words.filter((word) => !GENERIC_WORDS.has(word));
  // A name made only of generic words ("Furniture Co") is compared as a whole.
  return (specific.length > 0 ? specific : words).join("");
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Same key, a one-letter typo (two for long names), or one name being the
 * other plus extra words ("GRAND" vs "GRAND DIZAJN"). Short keys must match
 * exactly, or "ABC" would match half the list.
 */
export function similarCompanyNames(a: string, b: string): boolean {
  const ka = companyNameKey(a);
  const kb = companyNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const shorter = Math.min(ka.length, kb.length);
  if (shorter >= 5 && (ka.startsWith(kb) || kb.startsWith(ka))) return true;
  if (shorter < 5) return false;
  return editDistance(ka, kb) <= (shorter >= 10 ? 2 : 1);
}

function sameEmail(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Numbers compared by digits, so "+31 6 339…" (old data) equals "+316339…" (E.164). */
function sharesPhone(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  const mine = [a.phone, a.whatsapp].map(phoneDigits).filter((digits) => digits.length >= 7);
  const theirs = new Set([b.phone, b.whatsapp].map(phoneDigits).filter((digits) => digits.length >= 7));
  return mine.some((digits) => theirs.has(digits));
}

export function findDuplicates<T extends DuplicateCandidate>(
  candidate: DuplicateCandidate,
  existing: readonly T[],
): DuplicateMatch<T>[] {
  const matches: DuplicateMatch<T>[] = [];
  for (const customer of existing) {
    const reasons: DuplicateReason[] = [];
    if (sameEmail(candidate.email, customer.email)) reasons.push("email");
    if (sharesPhone(candidate, customer)) reasons.push("phone");
    if (similarCompanyNames(candidate.companyName, customer.companyName)) reasons.push("name");
    if (reasons.length > 0) matches.push({ customer, reasons });
  }
  return matches;
}
