/**
 * Every query the production role can reach goes through here.
 *
 * PRICE SAFETY: production must never receive price data, not even in a
 * hidden field (old Excel production sheets leaked prices in hidden
 * columns). So each query lists its columns explicitly — never
 * `select()` / `select(table)` — and none of them touches unit_price,
 * discount, piece prices, catalog prices, totals, advance/payment terms,
 * customer notes or payments. production-queries.test.ts checks the
 * generated SQL; extend that test's forbidden list when adding money columns.
 *
 * No `server-only` here so the test can build the SQL without a database;
 * only production.ts (server-only) executes these.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schemaTypes from "@/db/schema";
import {
  customers,
  fabrics,
  models,
  orderItemFabrics,
  orderItemPieces,
  orderItems,
  orderReferenceNotes,
  orders,
  pieceTypes,
  type CustomColumn,
  type CustomValues,
} from "@/db/schema";

type Database = PostgresJsDatabase<typeof schemaTypes>;

const overrideModel = alias(models, "override_model");
const overrideFabric = alias(fabrics, "override_fabric");

export const productionOrderColumns = {
  id: orders.id,
  number: orders.number,
  revision: orders.revision,
  status: orders.status,
  orderDate: orders.orderDate,
  customerName: customers.companyName,
  customerCountry: customers.country,
  productionNotes: orders.productionNotes,
  sampleApprovalRequired: orders.sampleApprovalRequired,
  sampleApprovalText: orders.sampleApprovalText,
  labelBranding: orders.labelBranding,
  customerLabelBranding: customers.labelBranding,
  customColumns: orders.customColumns,
  version: orders.version,
};

export const productionItemColumns = {
  id: orderItems.id,
  position: orderItems.position,
  modelCode: models.code,
  modelName: models.name,
  displayName: orderItems.displayName,
  composition: orderItems.composition,
  quantity: orderItems.quantity,
  unit: orderItems.unit,
  unitCbm: orderItems.unitCbm,
  photoPath: orderItems.photoPath,
  modelPhotoPath: models.mainPhotoPath,
  productionNote: orderItems.productionNote,
  customValues: orderItems.customValues,
};

export const productionPieceColumns = {
  itemId: orderItemPieces.itemId,
  position: orderItemPieces.position,
  pieceTypeCode: pieceTypes.code,
  pieceTypeName: pieceTypes.name,
  isAccessory: pieceTypes.isAccessory,
  qtyPerUnit: orderItemPieces.qtyPerUnit,
  modelOverrideCode: overrideModel.code,
  fabricOverrideBrand: overrideFabric.brand,
  fabricOverrideCode: overrideFabric.code,
  fabricOverrideColorKey: overrideFabric.colorKey,
};

export const productionFabricColumns = {
  itemId: orderItemFabrics.itemId,
  position: orderItemFabrics.position,
  role: orderItemFabrics.role,
  freeText: orderItemFabrics.freeText,
  brand: fabrics.brand,
  code: fabrics.code,
  colorKey: fabrics.colorKey,
  colorName: fabrics.colorName,
};

export const productionReferenceNoteColumns = {
  position: orderReferenceNotes.position,
  title: orderReferenceNotes.title,
  body: orderReferenceNotes.body,
  photoPath: orderReferenceNotes.photoPath,
};

export function productionQueries(db: Database, orderId: string) {
  return {
    order: db
      .select(productionOrderColumns)
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, orderId))
      .limit(1),
    items: db
      .select(productionItemColumns)
      .from(orderItems)
      .innerJoin(models, eq(models.id, orderItems.modelId))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.position)),
    pieces: db
      .select(productionPieceColumns)
      .from(orderItemPieces)
      .innerJoin(orderItems, eq(orderItems.id, orderItemPieces.itemId))
      .innerJoin(pieceTypes, eq(pieceTypes.id, orderItemPieces.pieceTypeId))
      .leftJoin(overrideModel, eq(overrideModel.id, orderItemPieces.modelOverrideId))
      .leftJoin(overrideFabric, eq(overrideFabric.id, orderItemPieces.fabricOverrideId))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.position), asc(orderItemPieces.position)),
    fabrics: db
      .select(productionFabricColumns)
      .from(orderItemFabrics)
      .innerJoin(orderItems, eq(orderItems.id, orderItemFabrics.itemId))
      .leftJoin(fabrics, eq(fabrics.id, orderItemFabrics.fabricId))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.position), asc(orderItemFabrics.position)),
    referenceNotes: db
      .select(productionReferenceNoteColumns)
      .from(orderReferenceNotes)
      .where(
        and(
          eq(orderReferenceNotes.orderId, orderId),
          sql`'production' = any(${orderReferenceNotes.showOn})`,
        ),
      )
      .orderBy(asc(orderReferenceNotes.position)),
  };
}

/** Custom columns marked for the production sheet. */
export function productionCustomColumns(columns: readonly CustomColumn[]): CustomColumn[] {
  return columns.filter((column) => column.showOn.includes("production"));
}

/**
 * Drops custom values of columns not shown on the production sheet — users
 * may add e.g. a "target price" column that is meant for the proforma only.
 */
export function pickProductionCustomValues(
  columns: readonly CustomColumn[],
  values: CustomValues,
): CustomValues {
  const visible = new Set(productionCustomColumns(columns).map((column) => column.key));
  return Object.fromEntries(Object.entries(values).filter(([key]) => visible.has(key)));
}
