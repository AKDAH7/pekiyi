/**
 * Reference data every installation needs: company settings, bank accounts,
 * piece types, catalog, fabrics, the first exchange rate, label templates.
 *
 * Insert-only: a row whose natural key already exists is left untouched,
 * even if the JSON now says something else. Users correct these values in
 * the app, and re-running the seed must never undo that.
 */
import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DEFAULT_REVISION_SUFFIX } from "../../lib/domain/order-number";
import * as schema from "../schema";
import type { LocalizedText } from "../schema";

import type { SeedData } from "./data";
import { LABEL_TEMPLATE_SEEDS } from "./label-templates";

export type SeedDb = PostgresJsDatabase<typeof schema>;
export type SeedTx = Parameters<Parameters<SeedDb["transaction"]>[0]>[0];
export type DbOrTx = SeedDb | SeedTx;

/** Rows inserted per table (existing rows are skipped, not counted). */
export type SeedReport = Record<string, number>;

const sameInAllLanguages = (text: string): LocalizedText => ({ tr: text, en: text, ar: text });

/**
 * The JSON writes the code into the pattern ("{YY}{MM}{DD}-{SEQ}ZOC"); we
 * keep it separately so it can change without touching the pattern.
 */
export function splitOrderNumberPattern(pattern: string): { pattern: string; orderCode: string } {
  const match = /\{SEQ\}(\p{Lu}[\p{Lu}\p{N}]*)/u.exec(pattern);
  if (!match) return { pattern, orderCode: "" };
  return { pattern: pattern.replace(match[0], "{SEQ}{CODE}"), orderCode: match[1] };
}

export async function modelIdsByCode(db: DbOrTx, codes: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: schema.models.id, code: schema.models.code })
    .from(schema.models)
    .where(inArray(schema.models.code, codes));
  return new Map(rows.map((row) => [row.code, row.id]));
}

export async function pieceTypeIdsByCode(db: DbOrTx): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: schema.pieceTypes.id, code: schema.pieceTypes.code })
    .from(schema.pieceTypes);
  return new Map(rows.map((row) => [row.code, row.id]));
}

export async function seedReferenceData(db: SeedDb, data: SeedData): Promise<SeedReport> {
  const report: SeedReport = {};
  const count = (table: string, rows: unknown[]) => {
    report[table] = (report[table] ?? 0) + rows.length;
  };

  await db.transaction(async (tx) => {
    const { company, bank } = data;
    const { pattern, orderCode } = splitOrderNumberPattern(company.orderNumber.pattern);
    count(
      "company_settings",
      await tx
        .insert(schema.companySettings)
        .values({
          id: 1,
          legalName: company.legalName,
          brandName: company.brandName,
          address: company.address,
          phone: company.phone,
          email: company.email,
          website: company.website,
          hsCode: company.hsCode,
          orderNumberPattern: pattern,
          revisionSuffix: company.orderNumber.revisionSuffix || DEFAULT_REVISION_SUFFIX,
          orderCode,
        })
        .onConflictDoNothing()
        .returning({ id: schema.companySettings.id }),
    );

    // Natural key = currency (one IBAN per currency), not the IBAN itself:
    // otherwise correcting an IBAN in the app and re-seeding would add the
    // old one back as a second account.
    for (const [index, account] of bank.accounts.entries()) {
      const [existing] = await tx
        .select({ id: schema.bankAccounts.id })
        .from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.currency, account.currency))
        .limit(1);
      if (existing) continue;
      count(
        "bank_accounts",
        await tx
          .insert(schema.bankAccounts)
          .values({
            bankName: bank.bankName,
            swift: bank.swift,
            branch: bank.branch,
            beneficiary: bank.beneficiary,
            currency: account.currency,
            iban: account.iban,
            sort: index * 10,
          })
          .onConflictDoNothing()
          .returning({ id: schema.bankAccounts.id }),
      );
    }

    const { date, USD_TRY, EUR_TRY } = data.exchangeRate;
    count(
      "exchange_rates",
      await tx
        .insert(schema.exchangeRates)
        .values([
          { date, fromCurrency: "USD", toCurrency: "TRY", rate: String(USD_TRY) },
          { date, fromCurrency: "EUR", toCurrency: "TRY", rate: String(EUR_TRY) },
        ])
        .onConflictDoNothing()
        .returning({ id: schema.exchangeRates.id }),
    );

    count(
      "piece_types",
      await tx
        .insert(schema.pieceTypes)
        .values(
          data.pieceTypes.map((type, index) => ({
            code: type.code,
            seats: type.seats,
            isAccessory: type.isAccessory ?? false,
            name: type.name,
            shortName: type.short,
            sort: index * 10,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: schema.pieceTypes.id }),
    );

    count(
      "models",
      await tx
        .insert(schema.models)
        .values(
          data.models.map((model, index) => ({
            code: model.code,
            // The source files only have codes; names are edited later.
            name: sameInAllLanguages(model.code),
            isSofabed: model.isSofabed,
            sort: index * 10,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: schema.models.id }),
    );

    const modelIds = await modelIdsByCode(
      tx,
      data.models.map((model) => model.code),
    );
    const pieceTypeIds = await pieceTypeIdsByCode(tx);

    const piecePriceRows = data.models.flatMap((model) => {
      const modelId = modelIds.get(model.code)!;
      const pieceCodes = new Set([...Object.keys(model.piecePrices), ...Object.keys(model.unitCbm ?? {})]);
      return [...pieceCodes].map((pieceCode) => {
        const pieceTypeId = pieceTypeIds.get(pieceCode);
        if (!pieceTypeId) throw new Error(`Model ${model.code}: unknown piece type ${pieceCode}`);
        const price = model.piecePrices[pieceCode];
        const unitCbm = model.unitCbm?.[pieceCode];
        return {
          modelId,
          pieceTypeId,
          basePrice: price ? String(price.price) : null,
          baseCurrency: price?.currency ?? "TRY",
          unitCbm: unitCbm === undefined ? null : String(unitCbm),
        };
      });
    });
    if (piecePriceRows.length > 0) {
      count(
        "model_piece_prices",
        await tx
          .insert(schema.modelPiecePrices)
          .values(piecePriceRows)
          .onConflictDoNothing()
          .returning({ id: schema.modelPiecePrices.id }),
      );
    }

    const presetRows = data.models.flatMap((model) =>
      model.presets.map((preset) => ({
        modelId: modelIds.get(model.code)!,
        composition: preset.composition,
        fixedPrice: preset.fixedPrice === null ? null : String(preset.fixedPrice),
        currency: preset.currency,
      })),
    );
    if (presetRows.length > 0) {
      count(
        "model_presets",
        await tx
          .insert(schema.modelPresets)
          .values(presetRows)
          .onConflictDoNothing()
          .returning({ id: schema.modelPresets.id }),
      );
    }

    count(
      "fabrics",
      await tx
        .insert(schema.fabrics)
        .values(
          data.fabrics.map((fabric) => ({
            brand: fabric.brand,
            code: fabric.code,
            colorKey: fabric.colorKey,
            colorName: fabric.color,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: schema.fabrics.id }),
    );

    count(
      "label_templates",
      await tx
        .insert(schema.labelTemplates)
        .values(LABEL_TEMPLATE_SEEDS.map((template, index) => ({ ...template, sort: index * 10 })))
        .onConflictDoNothing()
        .returning({ id: schema.labelTemplates.id }),
    );
  });

  return report;
}
