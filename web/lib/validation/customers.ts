import { z } from "zod";

import {
  CUSTOMER_DOC_LANGUAGES,
  CUSTOMER_INCOTERMS,
  CUSTOMER_LABEL_BRANDINGS,
} from "@/lib/customers/constants";
import { isCountryCode } from "@/lib/domain/countries";
import { isValidEan13 } from "@/lib/domain/labels";
import { normalizePhone } from "@/lib/domain/phone";

import {
  checkbox,
  currency,
  id,
  optionalEmail,
  optionalFile,
  optionalText,
  requiredText,
  version,
} from "./common";

const country = z
  .string({ error: "invalidCountry" })
  .trim()
  .toUpperCase()
  .refine(isCountryCode, { error: "invalidCountry" });

/** Empty / "none" (the select's "no value" entry) → undefined. */
const blankToUndefined = (value: unknown) => (value === "" || value === "none" ? undefined : value);

const optionalId = z.preprocess(blankToUndefined, id.optional()).transform((value) => value ?? null);

/** Normalized to E.164 later, once the country is known (see `checkPhones`). */
const phoneText = optionalText(40);

/** "pekiyi.com.tr" → "https://pekiyi.com.tr". */
const website = optionalText(200).transform((value, ctx) => {
  if (value === null) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.hostname.includes(".") && !/\s/.test(value)) return withScheme;
  } catch {
    // Reported below.
  }
  ctx.addIssue({ code: "custom", message: "invalidWebsite" });
  return z.NEVER;
});

/** Key/value rows ("BTW" → "NL 00373278B51"); fully empty rows are dropped. */
const taxIds = z
  .array(
    z.object({
      key: z.string().trim().max(30, { error: "tooLong" }).default(""),
      value: z.string().trim().max(100, { error: "tooLong" }).default(""),
    }),
  )
  .max(20)
  .default([])
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (!row.key && !row.value) return;
      if (!row.key) ctx.addIssue({ code: "custom", path: [index, "key"], message: "required" });
      if (!row.value) ctx.addIssue({ code: "custom", path: [index, "value"], message: "required" });
      const key = row.key.toLocaleUpperCase("tr");
      if (key && seen.has(key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "duplicateTaxId" });
      seen.add(key);
    });
  })
  .transform((rows) => {
    const filled = rows.filter((row) => row.key && row.value);
    return filled.length > 0
      ? Object.fromEntries(filled.map((row) => [row.key.toLocaleUpperCase("tr"), row.value]))
      : null;
  });

const customerFields = z.object({
  companyName: requiredText(200),
  contactPerson: optionalText(120),
  country,
  city: optionalText(100),
  address: optionalText(1000),
  phone: phoneText,
  whatsapp: phoneText,
  email: optionalEmail,
  website,
  taxIds,
  notes: optionalText(4000),
  docLanguage: z.enum(CUSTOMER_DOC_LANGUAGES, { error: "invalidLocale" }),
  defaultCurrency: currency,
  secondaryCurrency: z.preprocess(blankToUndefined, currency.optional()).transform((value) => value ?? null),
  defaultIncoterm: z.enum(CUSTOMER_INCOTERMS, { error: "invalidIncoterm" }),
  labelBranding: z.enum(CUSTOMER_LABEL_BRANDINGS, { error: "invalid" }),
  defaultLabelTemplateId: optionalId,
  logo: optionalFile,
  removeLogo: checkbox,
});

type CustomerFields = z.output<typeof customerFields>;
type Checked = Pick<CustomerFields, "country" | "phone" | "whatsapp" | "defaultCurrency" | "secondaryCurrency">;

/** Phone numbers must be readable in the customer's country; the two currencies must differ. */
function checkCustomer(data: Checked, ctx: z.RefinementCtx) {
  for (const field of ["phone", "whatsapp"] as const) {
    if (data[field] && !normalizePhone(data[field], data.country)) {
      ctx.addIssue({ code: "custom", path: [field], message: "invalidPhone" });
    }
  }
  if (data.secondaryCurrency && data.secondaryCurrency === data.defaultCurrency) {
    ctx.addIssue({ code: "custom", path: ["secondaryCurrency"], message: "sameCurrency" });
  }
}

function withE164<T extends Checked>(data: T): T {
  return {
    ...data,
    phone: normalizePhone(data.phone, data.country),
    whatsapp: normalizePhone(data.whatsapp, data.country),
  };
}

export const createCustomerSchema = customerFields
  .omit({ removeLogo: true })
  // Set by "Save anyway" after the duplicate warning.
  .extend({ confirmDuplicates: checkbox })
  .superRefine(checkCustomer)
  .transform(withE164);

export const updateCustomerSchema = customerFields
  .extend({ id, version, active: checkbox })
  .superRefine(checkCustomer)
  .transform(withE164);

export const setCustomerActiveSchema = z.object({ id, version, active: z.enum(["true", "false"]) });

export const deleteCustomerSchema = z.object({ id, version });

const searchText = z.string().trim().max(100).optional().catch(undefined);

export const customersSearchSchema = z.object({
  q: searchText,
  country: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  // Deactivated customers are hidden unless asked for.
  status: z.enum(["all", "active", "inactive"]).default("active").catch("active"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type CustomerFilters = z.output<typeof customersSearchSchema>;

export const customerTabSchema = z.enum(["info", "orders", "codes"]).default("info").catch("info");

/** EAN-13 as printed (spaces allowed), checked digit by digit. */
const ean13 = z
  .string({ error: "required" })
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .min(1, { error: "required" })
      .regex(/^\d{13}$/, { error: "invalidBarcodeFormat" })
      .refine(isValidEan13, { error: "invalidBarcodeCheckDigit" }),
  );

const productCodeFields = z.object({
  modelId: z.preprocess(blankToUndefined, z.uuid({ error: "required" })),
  // Empty = the code applies to every piece type / every fabric of the model.
  pieceTypeId: optionalId,
  fabricId: optionalId,
  barcode: ean13,
  stockCode: optionalText(60),
  customerProductName: optionalText(200),
  brandText: optionalText(100),
});

export const createProductCodeSchema = productCodeFields.extend({ customerId: id });

export const updateProductCodeSchema = productCodeFields.extend({ id, version });

export const deleteProductCodeSchema = z.object({ id, version });
