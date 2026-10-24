/**
 * Phone / WhatsApp numbers are stored in E.164 ("+31633999931") and shown in
 * international format ("+31 6 33999931"). Input may be written any way
 * people write numbers: spaces, dashes, brackets, a leading "00", or a
 * national number ("0532 …") read in the customer's country.
 */
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

function asCountry(country: string | null | undefined): CountryCode | undefined {
  return country && isSupportedCountry(country) ? country : undefined;
}

/**
 * E.164 for a number that is plausible (right length for its country), or
 * null when it can't be one. Empty input → null too; callers decide whether
 * that's allowed.
 */
export function normalizePhone(input: string | null | undefined, country?: string | null): string | null {
  const text = (input ?? "").trim().replace(/^00/, "+");
  if (!/\d/.test(text)) return null;
  const parsed = parsePhoneNumberFromString(text, asCountry(country));
  return parsed?.isPossible() ? parsed.number : null;
}

/** Display form of a stored number; anything that doesn't parse is shown as stored. */
export function formatPhone(stored: string): string {
  const parsed = parsePhoneNumberFromString(stored);
  return parsed ? parsed.formatInternational() : stored;
}

/** Click-to-chat link (wa.me wants the number as digits only, no "+"). */
export function whatsappUrl(stored: string): string | null {
  const digits = (normalizePhone(stored) ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** Digits only, for comparing numbers stored in different formats. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}
