/**
 * Reading a proforma snapshot (document_issues.snapshot, or the draft built
 * the same way from the live order). Issued snapshots are frozen and come in
 * every layout ever written (lib/orders/issue.ts PROFORMA_SNAPSHOT_VERSION),
 * so this is lenient: what an old snapshot lacks (names, the list of every
 * bank account) is optional, and the view model falls back.
 */
import { z } from "zod";

const text = z.string().nullish();
const decimal = z.union([z.string(), z.number()]).transform(String).nullish();

const localized = z
  .object({ tr: z.string().optional(), en: z.string().optional(), ar: z.string().optional() })
  .nullish();

const bankAccount = z.object({
  bankName: z.string(),
  swift: text,
  branch: text,
  beneficiary: z.string(),
  currency: z.string(),
  iban: z.string(),
});

const line = z.object({
  model: z.string(),
  displayName: localized,
  composition: text,
  quantity: z.number(),
  unit: z.enum(["SET", "PCS"]),
  unitPrice: decimal,
  discountPercent: decimal,
  unitCbm: decimal,
  photoPath: text,
  modelPhotoPath: text,
  customerNote: localized,
  customValues: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  fabrics: z.array(z.string()).default([]),
  pieces: z
    .array(
      z.object({
        pieceType: z.string(),
        qtyPerUnit: z.number(),
        modelOverride: text,
        fabric: text,
        unitPrice: decimal,
      }),
    )
    .default([]),
});

const lineTotals = z.object({
  unitPrice: decimal,
  lineTotal: decimal,
  unitCbm: decimal,
  lineCbm: decimal,
  secondaryUnitPrice: decimal,
  secondaryLineTotal: decimal,
});

export const proformaSnapshotSchema = z.object({
  number: z.string(),
  revision: z.number(),
  language: z.string(),
  company: z
    .object({
      legalName: z.string(),
      brandName: z.string(),
      address: text,
      phone: text,
      email: text,
      website: text,
      logoPath: text,
    })
    .nullish(),
  bankAccount: bankAccount.nullish(),
  bankAccounts: z.array(bankAccount).optional(),
  customer: z.object({
    companyName: z.string(),
    contactPerson: text,
    country: z.string(),
    city: text,
    address: text,
    phone: text,
    email: text,
    taxIds: z.record(z.string(), z.string()).nullish(),
  }),
  names: z
    .object({
      models: z.record(z.string(), localized).default({}),
      pieceTypes: z
        .record(
          z.string(),
          z.object({ name: localized, shortName: localized, isAccessory: z.boolean().default(false), sort: z.number().default(0) }),
        )
        .default({}),
      fabrics: z.record(z.string(), localized).default({}),
    })
    .optional(),
  order: z.object({
    orderDate: z.string(),
    currency: z.string(),
    secondaryCurrency: text,
    secondaryRate: decimal,
    incoterm: z.string(),
    deliveryTime: localized,
    paymentTerms: localized,
    advanceType: z.enum(["amount", "percent"]).nullish(),
    advanceValue: decimal,
    customerNotes: localized,
    sampleApprovalRequired: z.boolean().default(false),
    sampleApprovalText: localized,
    documentOptions: z
      .object({
        showPiecePrices: z.boolean().optional(),
        showSecondaryCurrency: z.boolean().optional(),
        showCbm: z.boolean().optional(),
        showPhotos: z.boolean().optional(),
        bankOrderCurrencyOnly: z.boolean().optional(),
      })
      .default({}),
    customColumns: z
      .array(z.object({ key: z.string(), label: localized, type: z.enum(["text", "number"]), showOn: z.array(z.string()) }))
      .default([]),
    lines: z.array(line),
    referenceNotes: z.array(z.object({ title: localized, body: localized, photoPath: text })).default([]),
  }),
  totals: z.object({
    currency: z.string(),
    lines: z.array(lineTotals),
    total: z.string(),
    advance: z.string(),
    balance: z.string(),
    secondary: z
      .object({ currency: z.string(), rate: z.string(), total: z.string(), advance: z.string(), balance: z.string() })
      .nullish(),
    totalCbm: z.string(),
  }),
});

export type ProformaSnapshot = z.infer<typeof proformaSnapshotSchema>;
export type SnapshotNames = NonNullable<ProformaSnapshot["names"]>;

/** Parses a stored snapshot; throws when it isn't a proforma snapshot at all. */
export function parseProformaSnapshot(value: unknown): ProformaSnapshot {
  return proformaSnapshotSchema.parse(value);
}
