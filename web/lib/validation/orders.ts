import { z } from "zod";

import { DOC_LANGUAGES } from "@/db/schema/common";
import { LABEL_BRANDINGS } from "@/db/schema/customers";
import { CUSTOMER_INCOTERMS } from "@/lib/customers/constants";
import { DOCUMENT_FORMATS, DOCUMENT_LANGUAGES } from "@/lib/documents/languages";
import { parseComposition } from "@/lib/domain/composition";
import {
  CUSTOM_COLUMN_KEY_RE,
  CUSTOM_COLUMN_TYPES,
  CUSTOM_VALUE_MAX,
  DOCUMENT_TARGET_LIST,
  MAX_CUSTOM_COLUMNS,
  pruneCustomValues,
} from "@/lib/orders/custom-columns";
import {
  ADVANCE_MODES,
  DOCUMENT_OPTION_KEYS,
  MAX_FABRICS_PER_LINE,
  MAX_ORDER_LINES,
  MAX_PIECES_PER_LINE,
  ORDER_PHOTO_KEY_RE,
  ORDER_STATUS_LIST,
  ORDER_UNIT_LIST,
} from "@/lib/orders/constants";

import { currency, decimal, id, localizedOptional, localizedRequired, moneyValue, optionalText, requiredText, version } from "./common";

/*
 * The order editor saves header + lines + pieces + fabrics as one JSON
 * payload. Decimals travel as canonical strings ("650.00", "" = empty).
 *
 * Price fields (line/piece unit price, discount, advance) are optional on
 * purpose: roles without `prices.update` don't send them at all, and the
 * action answers 403 if they do (see PRICE_FIELDS in lib/orders/price-guard.ts).
 */

const discountValue = decimal({ scale: 2, integerDigits: 3 }).refine(
  (value) => value === null || value === undefined || Number(value) <= 100,
  { error: "percentTooLarge" },
);

const cbmValue = decimal({ scale: 3, integerDigits: 5, positive: true });

const rateValue = decimal({ scale: 6, integerDigits: 8, positive: true });

const nullableId = id.nullable().default(null);

/** A {tr,en,ar} text the editor sends as null when it is empty. */
const localizedText = (max: number) => z.preprocess((value) => value ?? undefined, localizedOptional(max));

const pieceSchema = z.object({
  id,
  pieceTypeId: z.uuid({ error: "required" }),
  qtyPerUnit: z.number({ error: "wholeNumber" }).int({ error: "wholeNumber" }).min(1, { error: "mustBePositive" }).max(999),
  modelOverrideId: nullableId,
  fabricOverrideId: nullableId,
  unitPrice: moneyValue,
});

const fabricSchema = z
  .object({
    fabricId: nullableId,
    freeText: optionalText(120).nullable().default(null),
  })
  .refine((fabric) => fabric.fabricId !== null || fabric.freeText !== null, { error: "required" });

const compositionText = z
  .string()
  .trim()
  .max(60, { error: "tooLong" })
  .nullable()
  .default(null)
  .transform((value) => value || null)
  .refine((value) => value === null || parseComposition(value).ok, { error: "invalidComposition" });

/** One custom column; Turkish label required like every other translated name. */
const customColumnSchema = z.object({
  key: z.string().regex(CUSTOM_COLUMN_KEY_RE, { error: "invalid" }),
  label: localizedRequired(60),
  type: z.enum(CUSTOM_COLUMN_TYPES, { error: "invalid" }),
  showOn: z
    .array(z.enum(DOCUMENT_TARGET_LIST, { error: "invalid" }))
    .default([])
    .transform((targets) => DOCUMENT_TARGET_LIST.filter((target) => targets.includes(target))),
});

export const customColumnsSchema = z
  .array(customColumnSchema)
  .max(MAX_CUSTOM_COLUMNS, { error: "tooManyColumns" })
  .default([])
  .superRefine((columns, ctx) => {
    const seen = new Set<string>();
    columns.forEach((column, index) => {
      if (seen.has(column.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "invalid" });
      seen.add(column.key);
    });
  });

const customValuesSchema = z
  .record(z.string(), z.string().trim().max(CUSTOM_VALUE_MAX, { error: "tooLong" }).nullable())
  .default({});

/** A number column's value: a canonical decimal string ("12.5", "-3"). */
const NUMBER_VALUE_RE = /^-?\d{1,12}(\.\d{1,6})?$/;

const itemSchema = z.object({
  id,
  // The grid keeps unknown (pasted) models as null until the user picks one.
  modelId: z.uuid({ error: "modelRequired" }),
  composition: compositionText,
  quantity: z.number({ error: "wholeNumber" }).int({ error: "wholeNumber" }).min(1, { error: "mustBePositive" }).max(100_000, {
    error: "numberTooLarge",
  }),
  unit: z.enum(ORDER_UNIT_LIST, { error: "invalid" }),
  unitPrice: moneyValue,
  discountPercent: discountValue,
  unitCbm: cbmValue,
  photoPath: z
    .string()
    .regex(ORDER_PHOTO_KEY_RE, { error: "invalid" })
    .nullable()
    .default(null),
  customerNote: localizedText(2000),
  productionNote: localizedText(2000),
  customValues: customValuesSchema,
  fabrics: z.array(fabricSchema).max(MAX_FABRICS_PER_LINE).default([]),
  pieces: z.array(pieceSchema).min(1, { error: "piecesRequired" }).max(MAX_PIECES_PER_LINE),
});

const documentOptions = z.object(
  Object.fromEntries(DOCUMENT_OPTION_KEYS.map((key) => [key, z.boolean().default(false)])) as Record<
    (typeof DOCUMENT_OPTION_KEYS)[number],
    z.ZodDefault<z.ZodBoolean>
  >,
);

const headerSchema = z
  .object({
    customerId: z.uuid({ error: "required" }),
    orderDate: z.iso.date({ error: "invalidDate" }),
    currency,
    secondaryCurrency: currency.nullable().default(null),
    secondaryRate: rateValue,
    incoterm: z.enum(CUSTOMER_INCOTERMS, { error: "invalidIncoterm" }),
    deliveryTime: localizedText(200),
    paymentTerms: localizedText(500),
    advanceMode: z.enum(ADVANCE_MODES, { error: "invalid" }).optional(),
    advanceValue: moneyValue,
    customerNotes: localizedText(4000),
    productionNotes: localizedText(4000),
    sampleApprovalRequired: z.boolean().default(false),
    sampleApprovalText: localizedText(1000),
    documentOptions,
    // Null = use the customer's setting.
    labelBranding: z.enum(LABEL_BRANDINGS, { error: "invalid" }).nullable().default(null),
    labelTemplateId: nullableId,
    customColumns: customColumnsSchema,
  })
  .superRefine((header, ctx) => {
    if (header.secondaryCurrency) {
      if (header.secondaryCurrency === header.currency) {
        ctx.addIssue({ code: "custom", path: ["secondaryCurrency"], message: "sameCurrency" });
      }
      if (!header.secondaryRate) ctx.addIssue({ code: "custom", path: ["secondaryRate"], message: "required" });
    }
    if (header.advanceMode !== undefined && header.advanceMode !== "none") {
      if (!header.advanceValue) ctx.addIssue({ code: "custom", path: ["advanceValue"], message: "required" });
      else if (header.advanceMode === "percent" && Number(header.advanceValue) > 100) {
        ctx.addIssue({ code: "custom", path: ["advanceValue"], message: "percentTooLarge" });
      }
    }
  })
  .transform(({ secondaryRate, ...header }) => ({
    ...header,
    // Only kept together with a secondary currency (DB pair check).
    secondaryRate: header.secondaryCurrency ? (secondaryRate ?? null) : null,
  }));

const items = z
  .array(itemSchema)
  .max(MAX_ORDER_LINES, { error: "tooManyLines" })
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      for (const ref of [row.id, ...row.pieces.map((piece) => piece.id)]) {
        if (seen.has(ref)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "invalid" });
        seen.add(ref);
      }
    });
  });

/**
 * Custom values: only columns of the order are kept (values of removed
 * columns are dropped), and a number column only takes numbers.
 */
export const createOrderSchema = z
  .object({ header: headerSchema, items })
  .superRefine((order, ctx) => {
    const numbers = new Set(order.header.customColumns.filter((column) => column.type === "number").map((column) => column.key));
    order.items.forEach((item, index) => {
      for (const [key, value] of Object.entries(item.customValues)) {
        if (numbers.has(key) && value && !NUMBER_VALUE_RE.test(value)) {
          ctx.addIssue({ code: "custom", path: ["items", index, "customValues", key], message: "invalidNumber" });
        }
      }
    });
  })
  .transform((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item, customValues: pruneCustomValues(item.customValues, order.header.customColumns) })),
  }));

export const updateOrderSchema = z.object({ id, version }).and(createOrderSchema);

export type OrderInput = z.input<typeof createOrderSchema>;
export type OrderHeaderInput = z.input<typeof headerSchema>;
export type OrderItemInput = z.input<typeof itemSchema>;
export type OrderData = z.output<typeof createOrderSchema>;
export type OrderItemData = OrderData["items"][number];

export const duplicateOrderSchema = z.object({ id });

/** Status menu: the target status, an optional note, and the reason a step back needs. */
export const changeStatusSchema = z.object({
  id,
  version,
  to: z.enum(ORDER_STATUS_LIST, { error: "invalid" }),
  note: optionalText(500),
  reason: optionalText(500),
});

export const issueProformaSchema = z.object({
  id,
  version,
  language: z.enum(DOC_LANGUAGES, { error: "invalid" }),
});

export const COLUMN_TEMPLATE_SCOPES = ["global", "customer"] as const;

export const saveColumnTemplateSchema = z
  .object({
    name: requiredText(80),
    scope: z.enum(COLUMN_TEMPLATE_SCOPES, { error: "invalid" }),
    customerId: id,
    isDefault: z.boolean().default(false),
    columns: customColumnsSchema.refine((columns) => columns.length > 0, { error: "noColumns" }),
  })
  .transform((template) => ({
    ...template,
    // Only a customer's template can be its default.
    isDefault: template.scope === "customer" && template.isDefault,
  }));

export const deleteColumnTemplateSchema = z.object({ id });

export const orderIdSchema = z.object({ id });

export const ordersSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined).transform((value) => value || undefined),
  status: z.enum(ORDER_STATUS_LIST).optional().catch(undefined),
  customer: z.uuid().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type OrderFilters = z.output<typeof ordersSearchSchema>;

export const newOrderSearchSchema = z.object({
  customer: z.uuid().optional().catch(undefined),
});

/** Proforma file requests: `/api/orders/<id>/proforma/<issueId>?format=pdf&lang=en` and the draft preview. */
export const proformaFileSchema = z.object({
  id,
  issueId: id.optional(),
  format: z.enum(DOCUMENT_FORMATS).default("pdf"),
  lang: z.enum(DOCUMENT_LANGUAGES).optional(),
});
