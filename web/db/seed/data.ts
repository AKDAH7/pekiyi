/**
 * Loads and validates web/db/seed-data/pekiyi-seed-data.json. Shared by the
 * seed script and the domain tests, so both read the file the same way.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { Catalog, OrderForTotals } from "../../lib/domain/types";

const localized = z.object({ tr: z.string(), en: z.string(), ar: z.string() }).partial();
const amount = z.number().nonnegative();

const piece = z.object({
  pieceType: z.string(),
  qtyPerUnit: z.number().int().positive(),
  unitPrice: amount.optional(),
  modelOverride: z.string().optional(),
});

const item = z.object({
  model: z.string(),
  composition: z.string(),
  pieces: z.array(piece).min(1),
  fabrics: z.array(z.string()).min(1),
  qty: z.number().int().positive(),
  unit: z.enum(["SET", "PCS"]),
  unitPrice: amount,
  unitCbm: z.number().positive().optional(),
  notes: z
    .object({ customer: localized.optional(), production: localized.optional() })
    .optional(),
});

const sampleOrder = z.object({
  customer: z.string(),
  number: z.string(),
  baseNumber: z.string().optional(),
  revision: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incoterm: z.string(),
  currency: z.string(),
  secondaryCurrency: z.object({ currency: z.string(), usdPerEur: z.number().positive() }).optional(),
  deliveryTime: z.string().optional(),
  paymentTerms: z.string().optional(),
  advance: z
    .union([z.object({ amount }), z.object({ percent: z.number().min(0).max(100) })])
    .nullable()
    .optional(),
  documentOptions: z
    .object({
      showPiecePrices: z.boolean(),
      showSecondaryCurrency: z.boolean(),
      showCbm: z.boolean(),
      showPhotos: z.boolean(),
    })
    .partial()
    .optional(),
  items: z.array(item).min(1),
  customerNotes: localized.optional(),
  productionNotes: localized.optional(),
  labelRequirements: z.string().optional(),
  referenceNotes: z.array(z.object({ title: localized, photo: z.boolean() })).optional(),
  sampleApprovalRequired: localized.optional(),
  expected: z.record(z.string(), z.number()),
  sourceIssues: z.array(z.string()).optional(),
});

const seedDataSchema = z.object({
  _readme: z.string(),
  company: z.object({
    brandName: z.string(),
    legalName: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string(),
    website: z.string(),
    hsCode: z.string(),
    orderNumber: z.object({ pattern: z.string(), revisionSuffix: z.string(), note: z.string() }),
  }),
  bank: z.object({
    bankName: z.string(),
    swift: z.string(),
    branch: z.string(),
    beneficiary: z.string(),
    accounts: z.array(
      z.object({ currency: z.string(), iban: z.string(), note: z.string().optional() }),
    ),
  }),
  exchangeRate: z.object({
    date: z.string(),
    USD_TRY: z.number().positive(),
    EUR_TRY: z.number().positive(),
    note: z.string().optional(),
  }),
  pieceTypes: z.array(
    z.object({
      code: z.string(),
      seats: z.number().int().nonnegative(),
      isAccessory: z.boolean().optional(),
      name: localized,
      short: localized,
    }),
  ),
  models: z.array(
    z.object({
      code: z.string(),
      isSofabed: z.boolean(),
      piecePrices: z.record(z.string(), z.object({ price: amount, currency: z.string() })),
      presets: z.array(
        z.object({ composition: z.string(), fixedPrice: amount.nullable(), currency: z.string() }),
      ),
      unitCbm: z.record(z.string(), z.number().positive()).optional(),
    }),
  ),
  fabrics: z.array(
    z.object({
      brand: z.string(),
      code: z.string(),
      colorKey: z.string().nullable(),
      color: localized.nullable(),
    }),
  ),
  customers: z.array(
    z.object({
      key: z.string(),
      company: z.string(),
      contactPerson: z.string().optional(),
      country: z.string().length(2),
      city: z.string().nullable().optional(),
      address: z.string().optional(),
      taxIds: z.record(z.string(), z.string()).optional(),
      email: z.string().optional(),
      phone: z.string().nullable(),
      docLanguage: z.enum(["tr", "en", "ar"]),
      currency: z.string(),
      secondaryCurrency: z.string().optional(),
    }),
  ),
  sampleOrders: z.array(sampleOrder),
  catalogWarnings: z.array(z.string()),
});

export type SeedData = z.infer<typeof seedDataSchema>;
export type SampleOrder = z.infer<typeof sampleOrder>;

export const SEED_DATA_PATH = path.resolve(__dirname, "../seed-data/pekiyi-seed-data.json");

export function loadSeedData(file = SEED_DATA_PATH): SeedData {
  return seedDataSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export type FabricRef = { brand: string; code: string };

/**
 * Orders write fabrics as "BRAND CODE [COLOUR]" ("BOYTEKS 30147204 KAPUÇİNO",
 * "EMK 663 V04"). Codes may contain spaces, so match against the catalog
 * (longest code first) instead of splitting on spaces.
 */
export function resolveFabric<T extends FabricRef>(label: string, fabrics: readonly T[]): T | null {
  const candidates = [...fabrics].sort((a, b) => b.code.length - a.code.length);
  return (
    candidates.find((fabric) => {
      const prefix = `${fabric.brand} ${fabric.code}`;
      return label === prefix || label.startsWith(`${prefix} `);
    }) ?? null
  );
}

/** Catalog in the shape the domain functions take. */
export function catalogFromSeed(data: SeedData): Catalog {
  return {
    pieces: data.models.flatMap((model) => {
      const pieceTypes = new Set([
        ...Object.keys(model.piecePrices),
        ...Object.keys(model.unitCbm ?? {}),
      ]);
      return [...pieceTypes].map((pieceType) => ({
        model: model.code,
        pieceType,
        basePrice: model.piecePrices[pieceType]?.price ?? null,
        baseCurrency: model.piecePrices[pieceType]?.currency ?? "TRY",
        unitCbm: model.unitCbm?.[pieceType] ?? null,
      }));
    }),
    presets: data.models.flatMap((model) =>
      model.presets.map((preset) => ({ model: model.code, ...preset })),
    ),
    accessoryPieceTypes: data.pieceTypes.filter((type) => type.isAccessory).map((type) => type.code),
  };
}

/** A sample order in the shape the domain functions take. */
export function sampleOrderToDomain(order: SampleOrder): OrderForTotals {
  const advance = order.advance ?? null;
  return {
    currency: order.currency,
    secondaryCurrency: order.secondaryCurrency?.currency ?? null,
    secondaryRate: order.secondaryCurrency?.usdPerEur ?? null,
    advanceType: advance === null ? null : "amount" in advance ? "amount" : "percent",
    advanceValue: advance === null ? null : "amount" in advance ? advance.amount : advance.percent,
    items: order.items.map((line) => ({
      model: line.model,
      composition: line.composition,
      quantity: line.qty,
      unit: line.unit,
      unitPrice: line.unitPrice,
      unitCbm: line.unitCbm ?? null,
      fabrics: line.fabrics,
      pieces: line.pieces.map((p) => ({
        pieceType: p.pieceType,
        qtyPerUnit: p.qtyPerUnit,
        modelOverride: p.modelOverride ?? null,
        unitPrice: p.unitPrice ?? null,
      })),
    })),
  };
}
