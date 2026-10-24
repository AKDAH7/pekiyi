import { z } from "zod";

import { DOC_LANGUAGES, type LocalizedText } from "@/db/schema/common";

import { CURRENCIES } from "./currencies";

export { CURRENCIES, type AppCurrency } from "./currencies";

// Error messages are translation keys under `validation.*` in messages/*.json.

export const currency = z.enum(CURRENCIES, { error: "invalidCurrency" });

export const id = z.uuid({ error: "invalid" });

/** The `version` the edit form was loaded with (optimistic locking). */
export const version = z.coerce.number({ error: "invalid" }).int().positive();

/** HTML checkbox: present ("on") = true, absent = false. */
export const checkbox = z.preprocess((value) => value === "on" || value === "true", z.boolean());

export function requiredText(max = 200) {
  return z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(max, { error: "tooLong" });
}

/** Empty → null. */
export function optionalText(max = 200) {
  return z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .optional()
    .transform((value) => value || null);
}

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: "tooLong" })
  .optional()
  .transform((value) => value || null)
  .pipe(z.email({ error: "invalidEmail" }).nullable());

function localizedShape(max: number) {
  const part = z.string().trim().max(max, { error: "tooLong" }).optional();
  return z.object({ tr: part, en: part, ar: part }).partial().default({});
}

function compact(value: LocalizedText): LocalizedText {
  const out: LocalizedText = {};
  for (const lang of DOC_LANGUAGES) if (value[lang]) out[lang] = value[lang];
  return out;
}

/** A {tr,en,ar} text (TranslatedInput) where Turkish is required. */
export function localizedRequired(max = 200) {
  return localizedShape(max)
    .refine((value) => !!value.tr, { path: ["tr"], error: "required" })
    .transform(compact);
}

/** A {tr,en,ar} text that may be left empty entirely (→ null). */
export function localizedOptional(max = 200) {
  return localizedShape(max).transform((value) => {
    const out = compact(value);
    return Object.keys(out).length > 0 ? out : null;
  });
}

type DecimalOptions = {
  /** Digits after the decimal point the column keeps. */
  scale: number;
  /** Digits before the decimal point the column keeps (precision − scale). */
  integerDigits: number;
  /** Reject 0 (rates, CBM). */
  positive?: boolean;
};

/**
 * A canonical decimal string as sent by MoneyInput/DecimalInput ("1250.5"),
 * checked against the numeric column's precision. Never converted to a JS
 * number. Empty → null; absent → undefined (so "not sent" stays visible).
 */
export function decimal({ scale, integerDigits, positive }: DecimalOptions) {
  return z
    .string()
    .trim()
    .transform((value) => value || null)
    .superRefine((value, ctx) => {
      if (value === null) return;
      const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
      if (!match) {
        ctx.addIssue({ code: "custom", message: "invalidNumber" });
        return;
      }
      const [, integer, fraction = ""] = match;
      if (fraction.replace(/0+$/, "").length > scale) {
        ctx.addIssue({ code: "custom", message: "tooManyDecimals" });
      } else if (integer.replace(/^0+(?=\d)/, "").length > integerDigits) {
        ctx.addIssue({ code: "custom", message: "numberTooLarge" });
      } else if (positive && /^[0.]+$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "mustBePositive" });
      }
    })
    .optional();
}

/** Same as `decimal` but must be filled in. */
export function requiredDecimal(options: DecimalOptions) {
  return decimal(options).refine((value) => value !== null && value !== undefined, {
    error: "required",
  });
}

/** numeric(12,2) */
export const moneyValue = decimal({ scale: 2, integerDigits: 10 });

/** A file input; an empty input (no file chosen) → null. */
export const optionalFile = z
  .custom<File | undefined>((value) => value === undefined || value instanceof File, {
    error: "invalid",
  })
  .transform((file) => (file && file.size > 0 ? file : null));
