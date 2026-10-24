import "server-only";

import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { fabrics, modelPiecePrices, modelPresets, models, pieceTypes } from "@/db/schema";
import { escapeLike } from "@/lib/db/like";
import type { Catalog } from "@/lib/domain/types";

export async function listPieceTypes() {
  return db.select().from(pieceTypes).orderBy(asc(pieceTypes.sort), asc(pieceTypes.code));
}

export type PieceTypeRow = Awaited<ReturnType<typeof listPieceTypes>>[number];

export type ModelListItem = {
  id: string;
  code: string;
  name: (typeof models.$inferSelect)["name"];
  isSofabed: boolean;
  active: boolean;
  mainPhotoPath: string | null;
  /** Piece type codes that have a catalog price. */
  pricedPieceTypes: string[];
  /** Neither a piece price nor a fixed preset price. */
  missingPrices: boolean;
  /** No piece has a CBM yet. */
  missingCbm: boolean;
};

export type ModelFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
  missing?: "all" | "any" | "prices" | "cbm";
};

export async function listModels(filters: ModelFilters): Promise<ModelListItem[]> {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(
        ilike(models.code, pattern),
        sql`${models.name}->>'tr' ilike ${pattern}`,
        sql`${models.name}->>'en' ilike ${pattern}`,
        sql`${models.name}->>'ar' ilike ${pattern}`,
      )!,
    );
  }
  if (filters.status === "active") conditions.push(eq(models.active, true));
  if (filters.status === "inactive") conditions.push(eq(models.active, false));

  const rows = await db
    .select({
      id: models.id,
      code: models.code,
      name: models.name,
      isSofabed: models.isSofabed,
      active: models.active,
      mainPhotoPath: models.mainPhotoPath,
    })
    .from(models)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(models.sort), asc(models.code));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [pieces, presets] = await Promise.all([
    db
      .select({
        modelId: modelPiecePrices.modelId,
        pieceType: pieceTypes.code,
        isAccessory: pieceTypes.isAccessory,
        sort: pieceTypes.sort,
        basePrice: modelPiecePrices.basePrice,
        unitCbm: modelPiecePrices.unitCbm,
      })
      .from(modelPiecePrices)
      .innerJoin(pieceTypes, eq(pieceTypes.id, modelPiecePrices.pieceTypeId))
      .where(inArray(modelPiecePrices.modelId, ids))
      .orderBy(asc(pieceTypes.sort)),
    db
      .select({ modelId: modelPresets.modelId, fixedPrice: modelPresets.fixedPrice })
      .from(modelPresets)
      .where(inArray(modelPresets.modelId, ids)),
  ]);

  const items = rows.map((row): ModelListItem => {
    const own = pieces.filter((piece) => piece.modelId === row.id);
    const main = own.filter((piece) => !piece.isAccessory);
    const hasFixedPrice = presets.some((preset) => preset.modelId === row.id && preset.fixedPrice !== null);
    return {
      ...row,
      pricedPieceTypes: own.filter((piece) => piece.basePrice !== null).map((piece) => piece.pieceType),
      missingPrices: !hasFixedPrice && !main.some((piece) => piece.basePrice !== null),
      missingCbm: !main.some((piece) => piece.unitCbm !== null),
    };
  });

  switch (filters.missing) {
    case "any":
      return items.filter((item) => item.missingPrices || item.missingCbm);
    case "prices":
      return items.filter((item) => item.missingPrices);
    case "cbm":
      return items.filter((item) => item.missingCbm);
    default:
      return items;
  }
}

export async function getModel(id: string) {
  const [model] = await db.select().from(models).where(eq(models.id, id));
  if (!model) return null;
  const [pieces, presets] = await Promise.all([
    db.select().from(modelPiecePrices).where(eq(modelPiecePrices.modelId, id)),
    db
      .select()
      .from(modelPresets)
      .where(eq(modelPresets.modelId, id))
      .orderBy(asc(modelPresets.createdAt), asc(modelPresets.composition)),
  ]);
  return { model, pieces, presets };
}

export type ModelDetail = NonNullable<Awaited<ReturnType<typeof getModel>>>;
export type PiecePriceRow = ModelDetail["pieces"][number];
export type PresetRow = ModelDetail["presets"][number];

/** One model's catalog in the shape the domain pricing functions take. */
export function catalogForModel(
  detail: ModelDetail,
  types: readonly PieceTypeRow[],
): Catalog {
  const codeOf = new Map(types.map((type) => [type.id, type.code]));
  return {
    pieces: detail.pieces.map((piece) => ({
      model: detail.model.code,
      pieceType: codeOf.get(piece.pieceTypeId) ?? piece.pieceTypeId,
      basePrice: piece.basePrice,
      baseCurrency: piece.baseCurrency,
      unitCbm: piece.unitCbm,
      packageCount: piece.packageCount,
    })),
    presets: detail.presets.map((preset) => ({
      model: detail.model.code,
      composition: preset.composition,
      fixedPrice: preset.fixedPrice,
      currency: preset.currency,
    })),
    accessoryPieceTypes: types.filter((type) => type.isAccessory).map((type) => type.code),
  };
}

export type FabricFilters = { q?: string; status?: "all" | "active" | "inactive" };

export async function listFabrics(filters: FabricFilters) {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(ilike(fabrics.brand, pattern), ilike(fabrics.code, pattern), ilike(fabrics.colorKey, pattern))!,
    );
  }
  if (filters.status === "active") conditions.push(eq(fabrics.active, true));
  if (filters.status === "inactive") conditions.push(eq(fabrics.active, false));

  return db
    .select()
    .from(fabrics)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(fabrics.brand), asc(fabrics.code));
}

export type FabricRow = Awaited<ReturnType<typeof listFabrics>>[number];
