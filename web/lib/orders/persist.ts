/**
 * Writing and reading one order as a unit: header + lines + pieces +
 * fabrics. Every function takes the running transaction, so the order
 * actions (actions/orders.ts) stay "one save = one transaction = one audit
 * entry", and the concurrency of numbering is tested against a real
 * database (persist.test.ts).
 *
 * Not `server-only` (only a type import of the db) so vitest can import it;
 * only server code does.
 */
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";
import {
  fabrics,
  models,
  orderItemFabrics,
  orderItemPieces,
  orderItems,
  orders,
  pieceTypes,
  type CustomValues,
  type OrderUnit,
} from "@/db/schema";
import type { LocalizedText } from "@/db/schema/common";
import { dec } from "@/lib/domain/decimal";
import { nextOrderNumber } from "@/lib/domain/order-number";

/** First key of the two-int advisory lock taken while numbering ("ORDN"). */
const ORDER_NUMBER_LOCK = 0x4f52444e;

type NumberingOptions = {
  /** Order date, YYYY-MM-DD: the number's date part and the day SEQ counts. */
  date: string;
  orderCode: string;
  pattern: string;
  revisionSuffix: string;
};

/**
 * The next free order number for `date`. Takes a transaction-scoped
 * advisory lock per day first, so two users saving a new order at the same
 * moment are serialised: the second waits until the first commits and then
 * sees its number. Numbers already used by orders of another date (an order
 * whose date was edited afterwards) are skipped too.
 */
export async function allocateOrderNumber(
  tx: Pick<Tx, "execute" | "select">,
  { date, orderCode, pattern, revisionSuffix }: NumberingOptions,
): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(${ORDER_NUMBER_LOCK}, hashtext(${date}))`);
  const rows = await tx.select({ number: orders.number }).from(orders).where(eq(orders.orderDate, date));
  const existing = rows.map((row) => row.number);

  for (;;) {
    const number = nextOrderNumber(date, existing, orderCode, { pattern, revisionSuffix });
    const [taken] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(or(eq(orders.number, number), eq(orders.baseNumber, number)))
      .limit(1);
    if (!taken) return number;
    existing.push(number);
  }
}

/** One line ready to be written; ids come from the editor (stable across saves). */
export type LineToWrite = {
  id: string;
  modelId: string;
  composition: string | null;
  quantity: number;
  unit: OrderUnit;
  unitPrice: string | null;
  discountPercent: string;
  unitCbm: string | null;
  photoPath: string | null;
  customerNote: LocalizedText | null;
  productionNote: LocalizedText | null;
  customValues: CustomValues;
  fabrics: { fabricId: string | null; freeText: string | null }[];
  pieces: {
    id: string;
    pieceTypeId: string;
    qtyPerUnit: number;
    modelOverrideId: string | null;
    fabricOverrideId: string | null;
    unitPrice: string | null;
  }[];
};

/** Numerics come back from Postgres as "650.00"; "650" is the same value. */
function sameDecimal(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a === b || dec(a).equals(dec(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

/** jsonb comes back with its keys reordered; compare by content. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));
}

/**
 * Writes `lines` as the order's lines, by id: changed rows are UPDATEd,
 * new ones INSERTed, removed ones DELETEd, and rows that didn't change are
 * not touched at all. Lines and pieces keep their identity across saves,
 * so rows that point at them (Phase 7 loading ticks on order_item_pieces)
 * survive every save that doesn't remove them. Fabrics have no id in the
 * editor; they are matched by position within their line.
 *
 * Only rows of this order are ever updated or deleted. An id from the
 * payload that belongs to another order becomes an insert, which the
 * primary key rejects (runMutation reports it as a conflict).
 */
export async function syncOrderLines(
  tx: Pick<Tx, "select" | "delete" | "insert" | "update">,
  orderId: string,
  lines: readonly LineToWrite[],
  createdBy: string | null,
): Promise<void> {
  const storedItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const itemIds = storedItems.map((item) => item.id);
  const [storedPieces, storedFabrics] =
    itemIds.length === 0
      ? [[], []]
      : await Promise.all([
          tx.select().from(orderItemPieces).where(inArray(orderItemPieces.itemId, itemIds)),
          tx.select().from(orderItemFabrics).where(inArray(orderItemFabrics.itemId, itemIds)),
        ]);

  const keepItems = new Set(lines.map((line) => line.id));
  const keepPieces = new Set(lines.flatMap((line) => line.pieces.map((piece) => piece.id)));

  // Removed pieces of kept lines; removed lines take their pieces and fabrics along (cascade).
  const removedPieces = storedPieces.filter((piece) => keepItems.has(piece.itemId) && !keepPieces.has(piece.id));
  if (removedPieces.length > 0) {
    await tx.delete(orderItemPieces).where(inArray(orderItemPieces.id, removedPieces.map((piece) => piece.id)));
  }
  const removedItems = itemIds.filter((id) => !keepItems.has(id));
  if (removedItems.length > 0) {
    await tx.delete(orderItems).where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, removedItems)));
  }

  const itemsById = new Map(storedItems.map((item) => [item.id, item]));
  const piecesById = new Map(storedPieces.map((piece) => [piece.id, piece]));

  // Lines before their pieces and fabrics (foreign keys).
  const newItems: (typeof orderItems.$inferInsert)[] = [];
  for (const [position, line] of lines.entries()) {
    const values = {
      position,
      modelId: line.modelId,
      composition: line.composition,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      unitCbm: line.unitCbm,
      photoPath: line.photoPath,
      customerNote: line.customerNote,
      productionNote: line.productionNote,
      customValues: line.customValues,
    };
    const stored = itemsById.get(line.id);
    if (!stored) {
      newItems.push({ id: line.id, orderId, ...values, createdBy });
      continue;
    }
    const changed =
      stored.position !== position ||
      stored.modelId !== line.modelId ||
      stored.composition !== line.composition ||
      stored.quantity !== line.quantity ||
      stored.unit !== line.unit ||
      !sameDecimal(stored.unitPrice, line.unitPrice) ||
      !sameDecimal(stored.discountPercent, line.discountPercent) ||
      !sameDecimal(stored.unitCbm, line.unitCbm) ||
      stored.photoPath !== line.photoPath ||
      !sameJson(stored.customerNote, line.customerNote) ||
      !sameJson(stored.productionNote, line.productionNote) ||
      !sameJson(stored.customValues, line.customValues);
    if (changed) {
      await tx
        .update(orderItems)
        .set({ ...values, version: sql`${orderItems.version} + 1` })
        .where(and(eq(orderItems.id, line.id), eq(orderItems.orderId, orderId)));
    }
  }
  if (newItems.length > 0) await tx.insert(orderItems).values(newItems);

  const newPieces: (typeof orderItemPieces.$inferInsert)[] = [];
  for (const line of lines) {
    for (const [position, piece] of line.pieces.entries()) {
      const values = {
        itemId: line.id,
        position,
        pieceTypeId: piece.pieceTypeId,
        qtyPerUnit: piece.qtyPerUnit,
        modelOverrideId: piece.modelOverrideId,
        fabricOverrideId: piece.fabricOverrideId,
        unitPrice: piece.unitPrice,
      };
      const stored = piecesById.get(piece.id);
      // A piece of a line removed in this save is gone by now (cascade): insert it again.
      if (!stored || !keepItems.has(stored.itemId)) {
        newPieces.push({ id: piece.id, ...values, createdBy });
        continue;
      }
      const changed =
        stored.itemId !== line.id ||
        stored.position !== position ||
        stored.pieceTypeId !== piece.pieceTypeId ||
        stored.qtyPerUnit !== piece.qtyPerUnit ||
        stored.modelOverrideId !== piece.modelOverrideId ||
        stored.fabricOverrideId !== piece.fabricOverrideId ||
        !sameDecimal(stored.unitPrice, piece.unitPrice);
      if (changed) {
        await tx
          .update(orderItemPieces)
          .set({ ...values, version: sql`${orderItemPieces.version} + 1` })
          .where(and(eq(orderItemPieces.id, piece.id), inArray(orderItemPieces.itemId, itemIds)));
      }
    }
  }
  if (newPieces.length > 0) await tx.insert(orderItemPieces).values(newPieces);

  const fabricsByItem = new Map<string, (typeof storedFabrics)[number][]>();
  for (const fabric of storedFabrics) {
    if (keepItems.has(fabric.itemId)) fabricsByItem.set(fabric.itemId, [...(fabricsByItem.get(fabric.itemId) ?? []), fabric]);
  }
  const newFabrics: (typeof orderItemFabrics.$inferInsert)[] = [];
  const removedFabrics: string[] = [];
  for (const line of lines) {
    const stored = (fabricsByItem.get(line.id) ?? []).sort((a, b) => a.position - b.position);
    for (const [position, fabric] of line.fabrics.entries()) {
      const values = {
        fabricId: fabric.fabricId,
        freeText: fabric.fabricId ? null : fabric.freeText,
        role: position === 0 ? "main" : "secondary",
        position,
      };
      const existing = stored[position];
      if (!existing) {
        newFabrics.push({ itemId: line.id, ...values, createdBy });
      } else if (
        existing.fabricId !== values.fabricId ||
        existing.freeText !== values.freeText ||
        existing.role !== values.role ||
        existing.position !== position
      ) {
        await tx
          .update(orderItemFabrics)
          .set({ ...values, version: sql`${orderItemFabrics.version} + 1` })
          .where(eq(orderItemFabrics.id, existing.id));
      }
    }
    removedFabrics.push(...stored.slice(line.fabrics.length).map((fabric) => fabric.id));
  }
  if (removedFabrics.length > 0) await tx.delete(orderItemFabrics).where(inArray(orderItemFabrics.id, removedFabrics));
  if (newFabrics.length > 0) await tx.insert(orderItemFabrics).values(newFabrics);
}

/** "BOYTEKS 30147204" — how orders and the domain functions name a catalog fabric. */
export function fabricLabel(fabric: { brand: string; code: string }): string {
  return `${fabric.brand} ${fabric.code}`;
}

/**
 * The whole order with the codes/labels of everything it references
 * (model codes, piece type codes, fabric labels), lines and pieces in
 * order. Null when the order doesn't exist.
 */
export async function loadOrderGraph(tx: Pick<Tx, "select">, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  const items = await tx
    .select({ item: orderItems, modelCode: models.code, modelPhotoPath: models.mainPhotoPath })
    .from(orderItems)
    .innerJoin(models, eq(models.id, orderItems.modelId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.position));
  const itemIds = items.map(({ item }) => item.id);

  const overrideModel = alias(models, "override_model");
  const overrideFabric = alias(fabrics, "override_fabric");
  const [pieceRows, fabricRows] =
    itemIds.length === 0
      ? [[], []]
      : await Promise.all([
          tx
            .select({
              piece: orderItemPieces,
              pieceTypeCode: pieceTypes.code,
              modelOverrideCode: overrideModel.code,
              fabricOverrideBrand: overrideFabric.brand,
              fabricOverrideCode: overrideFabric.code,
            })
            .from(orderItemPieces)
            .innerJoin(pieceTypes, eq(pieceTypes.id, orderItemPieces.pieceTypeId))
            .leftJoin(overrideModel, eq(overrideModel.id, orderItemPieces.modelOverrideId))
            .leftJoin(overrideFabric, eq(overrideFabric.id, orderItemPieces.fabricOverrideId))
            .where(inArray(orderItemPieces.itemId, itemIds))
            .orderBy(asc(orderItemPieces.position)),
          tx
            .select({ fabric: orderItemFabrics, brand: fabrics.brand, code: fabrics.code })
            .from(orderItemFabrics)
            .leftJoin(fabrics, eq(fabrics.id, orderItemFabrics.fabricId))
            .where(inArray(orderItemFabrics.itemId, itemIds))
            .orderBy(asc(orderItemFabrics.position)),
        ]);

  return {
    order,
    items: items.map(({ item, modelCode, modelPhotoPath }) => ({
      ...item,
      modelCode,
      modelPhotoPath,
      pieces: pieceRows
        .filter((row) => row.piece.itemId === item.id)
        .map((row) => ({
          ...row.piece,
          pieceTypeCode: row.pieceTypeCode,
          modelOverrideCode: row.modelOverrideCode,
          fabricOverrideLabel:
            row.fabricOverrideBrand !== null && row.fabricOverrideCode !== null
              ? fabricLabel({ brand: row.fabricOverrideBrand, code: row.fabricOverrideCode })
              : null,
        })),
      fabrics: fabricRows
        .filter((row) => row.fabric.itemId === item.id)
        .map((row) => ({
          fabricId: row.fabric.fabricId,
          freeText: row.fabric.freeText,
          label:
            row.brand !== null && row.code !== null
              ? fabricLabel({ brand: row.brand, code: row.code })
              : (row.fabric.freeText ?? ""),
        })),
    })),
  };
}

export type OrderGraph = NonNullable<Awaited<ReturnType<typeof loadOrderGraph>>>;
export type OrderGraphItem = OrderGraph["items"][number];
