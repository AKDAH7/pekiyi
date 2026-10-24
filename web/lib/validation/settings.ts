import { z } from "zod";

import { isValidIban, normalizeIban } from "@/lib/domain/iban";
import { isValidOrderCode } from "@/lib/domain/order-number";

import {
  checkbox,
  currency,
  id,
  localizedOptional,
  optionalEmail,
  optionalFile,
  optionalText,
  requiredDecimal,
  requiredText,
  version,
} from "./common";

export const companySettingsSchema = z.object({
  version,
  legalName: requiredText(200),
  brandName: requiredText(100),
  address: optionalText(500),
  phone: optionalText(50),
  email: optionalEmail,
  website: optionalText(200),
  hsCode: optionalText(20),
  orderCode: requiredText(10)
    .transform((value) => value.toLocaleUpperCase("tr"))
    .refine(isValidOrderCode, { error: "invalidOrderCode" }),
  defaultDeliveryTime: localizedOptional(1000),
  defaultPaymentTerms: localizedOptional(1000),
  logo: optionalFile,
  removeLogo: checkbox,
});

export const iban = requiredText(50)
  .transform(normalizeIban)
  .refine(isValidIban, { error: "invalidIban" });

/** SWIFT/BIC: 8 or 11 characters. */
const swift = optionalText(11)
  .transform((value) => value?.replace(/\s+/g, "").toUpperCase() || null)
  .refine((value) => value === null || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value), {
    error: "invalidSwift",
  });

export const bankAccountSchema = z.object({
  bankName: requiredText(100),
  swift,
  branch: optionalText(100),
  beneficiary: requiredText(200),
  currency,
  iban,
});

export const updateBankAccountSchema = bankAccountSchema.extend({ id, version });

export const setBankAccountActiveSchema = z.object({
  id,
  version,
  active: z.enum(["true", "false"]),
});

const rateValue = requiredDecimal({ scale: 6, integerDigits: 8, positive: true });

const isoDate = z
  .string({ error: "required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), { error: "invalidDate" });

export const addRatesSchema = z.object({
  date: isoDate,
  usdTry: rateValue,
  eurTry: rateValue,
});

/** Correcting a day's rates: both rows, each with the version it was loaded with. */
export const updateRatesSchema = addRatesSchema.extend({
  usdId: id,
  usdVersion: version,
  eurId: id,
  eurVersion: version,
});
