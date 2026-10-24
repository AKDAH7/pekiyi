import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Tx } from "@/db";
import {
  auditLog,
  columnTemplates,
  customers,
  documentIssues,
  fabrics,
  labelTemplates,
  modelPiecePrices,
  modelPresets,
  models,
  orderItemFabrics,
  orderItemPieces,
  orderItems,
  orderReferenceNotes,
  orders,
  pieceTypes,
  user,
  type CustomColumn,
  type OrderStatus,
} from "@/db/schema";
import { escapeLike } from "@/lib/db/like";
import { computePieceCounts } from "@/lib/domain/piece-counts";
import { computeOrderTotals } from "@/lib/domain/totals";
import type { Catalog, OrderForTotals } from "@/lib/domain/types";
import { FOLD_FROM, FOLD_TO, foldSearchText } from "@/lib/domain/text-fold";
import { pickLocalized } from "@/lib/i18n/localized";
import { ORDER_STATUS_LIST, ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import type { EditorOptions } from "@/lib/orders/editor";
import { buildHistory } from "@/lib/orders/history";
import { contentHash, proformaContent } from "@/lib/orders/issue";
import { fabricLabel, loadOrderGraph, type OrderGraph } from "@/lib/orders/persist";
import { fileUrl } from "@/lib/storage/urls";
import type { OrderFilters } from "@/lib/validation/orders";

/** Every model's catalog prices, CBMs and presets, in the shape the domain functions take. */
export async function loadDomainCatalog(): Promise<Catalog> {
  const [pieces, presets, types] = await Promise.all([
    db
      .select({
        model: models.code,
        pieceType: pieceTypes.code,
        basePrice: modelPiecePrices.basePrice,
        baseCurrency: modelPiecePrices.baseCurrency,
        unitCbm: modelPiecePrices.unitCbm,
        packageCount: modelPiecePrices.packageCount,
      })
      .from(modelPiecePrices)
      .innerJoin(models, eq(models.id, modelPiecePrices.modelId))
      .innerJoin(pieceTypes, eq(pieceTypes.id, modelPiecePrices.pieceTypeId)),
    db
      .select({
        model: models.code,
        composition: modelPresets.composition,
        fixedPrice: modelPresets.fixedPrice,
        currency: modelPresets.currency,
      })
      .from(modelPresets)
      .innerJoin(models, eq(models.id, modelPresets.modelId)),
    db.select({ code: pieceTypes.code }).from(pieceTypes).where(eq(pieceTypes.isAccessory, true)),
  ]);
  return { pieces, presets, accessoryPieceTypes: types.map((type) => type.code) };
}

function folded(column: SQL | typeof customers.companyName): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO}))`;
}

function listConditions(filters: OrderFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(
        ilike(orders.number, pattern),
        like(folded(customers.companyName), `%${escapeLike(foldSearchText(filters.q))}%`),
      )!,
    );
  }
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.customer) conditions.push(eq(orders.customerId, filters.customer));
  if (filters.from) conditions.push(gte(orders.orderDate, filters.from));
  if (filters.to) conditions.push(lte(orders.orderDate, filters.to));
  return conditions.length ? and(...conditions) : undefined;
}

/** Lines of several orders in the shape the domain functions take, keyed by order id. */
async function domainLinesOf(orderIds: string[]): Promise<Map<string, OrderForTotals["items"]>> {
  const result = new Map<string, OrderForTotals["items"]>();
  if (orderIds.length === 0) return result;
  const overrideModel = alias(models, "override_model");
  const [items, pieces, lineFabrics] = await Promise.all([
    db
      .select({ item: orderItems, model: models.code })
      .from(orderItems)
      .innerJoin(models, eq(models.id, orderItems.modelId))
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.position)),
    db
      .select({
        itemId: orderItemPieces.itemId,
        pieceType: pieceTypes.code,
        qtyPerUnit: orderItemPieces.qtyPerUnit,
        unitPrice: orderItemPieces.unitPrice,
        modelOverride: overrideModel.code,
      })
      .from(orderItemPieces)
      .innerJoin(orderItems, eq(orderItems.id, orderItemPieces.itemId))
      .innerJoin(pieceTypes, eq(pieceTypes.id, orderItemPieces.pieceTypeId))
      .leftJoin(overrideModel, eq(overrideModel.id, orderItemPieces.modelOverrideId))
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItemPieces.position)),
    db
      .select({ itemId: orderItemFabrics.itemId, brand: fabrics.brand, code: fabrics.code, freeText: orderItemFabrics.freeText })
      .from(orderItemFabrics)
      .innerJoin(orderItems, eq(orderItems.id, orderItemFabrics.itemId))
      .leftJoin(fabrics, eq(fabrics.id, orderItemFabrics.fabricId))
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItemFabrics.position)),
  ]);
  for (const { item, model } of items) {
    const lines = result.get(item.orderId) ?? [];
    lines.push({
      model,
      composition: item.composition,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      unitCbm: item.unitCbm,
      pieces: pieces.filter((piece) => piece.itemId === item.id),
      fabrics: lineFabrics
        .filter((fabric) => fabric.itemId === item.id)
        .map((fabric) =>
          fabric.brand !== null && fabric.code !== null ? fabricLabel({ brand: fabric.brand, code: fabric.code }) : (fabric.freeText ?? ""),
        ),
    });
    result.set(item.orderId, lines);
  }
  return result;
}

export async function listOrders(filters: OrderFilters) {
  const where = listConditions(filters);
  const [[{ total }], rows, catalog] = await Promise.all([
    db.select({ total: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where),
    db
      .select({
        id: orders.id,
        number: orders.number,
        revision: orders.revision,
        orderDate: orders.orderDate,
        status: orders.status,
        currency: orders.currency,
        secondaryCurrency: orders.secondaryCurrency,
        secondaryRate: orders.secondaryRate,
        advanceType: orders.advanceType,
        advanceValue: orders.advanceValue,
        customerId: orders.customerId,
        companyName: customers.companyName,
        country: customers.country,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(where)
      .orderBy(desc(orders.orderDate), desc(orders.createdAt), asc(orders.id))
      .limit(ORDERS_PAGE_SIZE)
      .offset((filters.page - 1) * ORDERS_PAGE_SIZE),
    loadDomainCatalog(),
  ]);

  const lines = await domainLinesOf(rows.map((row) => row.id));
  const withTotals = rows.map((row) => {
    const items = lines.get(row.id) ?? [];
    const domain: OrderForTotals = { ...row, items };
    const totals = computeOrderTotals(domain, catalog);
    const pieces = computePieceCounts(domain).reduce((sum, group) => sum + group.quantity, 0);
    const sets = items.filter((item) => item.unit === "SET").reduce((sum, item) => sum + item.quantity, 0);
    return { ...row, total: totals.total, totalCbm: totals.totalCbm, sets, pieces, lineCount: items.length };
  });

  return { rows: withTotals, total, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

export type OrderListRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/** Customers that have orders, for the list filter. */
export async function listOrderCustomers() {
  return db
    .selectDistinct({ id: customers.id, companyName: customers.companyName, country: customers.country })
    .from(customers)
    .innerJoin(orders, eq(orders.customerId, customers.id))
    .orderBy(asc(customers.companyName));
}

/** Who saved an order last, and when (from its audit trail). */
export async function lastOrderChange(orderId: string) {
  const [row] = await db
    .select({ at: auditLog.createdAt, userName: user.name })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(and(eq(auditLog.entity, "order"), eq(auditLog.entityId, orderId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getOrderVersion(orderId: string) {
  const [row] = await db
    .select({ version: orders.version, updatedAt: orders.updatedAt })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row ?? null;
}

export async function getOrderForEditor(orderId: string) {
  const graph = await loadOrderGraph(db, orderId);
  if (!graph) return null;
  const [customer] = await db
    .select({ id: customers.id, companyName: customers.companyName, country: customers.country, docLanguage: customers.docLanguage })
    .from(customers)
    .where(eq(customers.id, graph.order.customerId));
  return { ...graph, customer };
}

/** Everything the order editor chooses from. Inactive entries are included (an order may use them). */
export async function getEditorOptions() {
  const [customerRows, modelRows, presetRows, typeRows, fabricRows, templateRows, catalog] = await Promise.all([
    db
      .select({
        id: customers.id,
        companyName: customers.companyName,
        country: customers.country,
        active: customers.active,
        defaultCurrency: customers.defaultCurrency,
        secondaryCurrency: customers.secondaryCurrency,
        defaultIncoterm: customers.defaultIncoterm,
        labelBranding: customers.labelBranding,
        defaultLabelTemplateId: customers.defaultLabelTemplateId,
      })
      .from(customers)
      .orderBy(asc(customers.companyName)),
    db
      .select({
        id: models.id,
        code: models.code,
        name: models.name,
        photoPath: models.mainPhotoPath,
        active: models.active,
      })
      .from(models)
      .orderBy(asc(models.sort), asc(models.code)),
    db
      .select({ modelId: modelPresets.modelId, composition: modelPresets.composition })
      .from(modelPresets)
      .orderBy(asc(modelPresets.createdAt)),
    db
      .select({
        id: pieceTypes.id,
        code: pieceTypes.code,
        seats: pieceTypes.seats,
        isAccessory: pieceTypes.isAccessory,
        name: pieceTypes.name,
        shortName: pieceTypes.shortName,
      })
      .from(pieceTypes)
      .orderBy(asc(pieceTypes.sort), asc(pieceTypes.code)),
    db
      .select({ id: fabrics.id, brand: fabrics.brand, code: fabrics.code, colorKey: fabrics.colorKey, active: fabrics.active })
      .from(fabrics)
      .orderBy(asc(fabrics.brand), asc(fabrics.code)),
    db
      .select({ id: labelTemplates.id, name: labelTemplates.name, active: labelTemplates.active })
      .from(labelTemplates)
      .orderBy(asc(labelTemplates.sort), asc(labelTemplates.code)),
    loadDomainCatalog(),
  ]);

  return {
    customers: customerRows,
    models: modelRows.map((model) => ({
      ...model,
      presets: presetRows.filter((preset) => preset.modelId === model.id).map((preset) => preset.composition),
    })),
    pieceTypes: typeRows,
    fabrics: fabricRows,
    labelTemplates: templateRows,
    catalog,
  };
}

export type EditorOptionsData = Awaited<ReturnType<typeof getEditorOptions>>;

/** The editor's options in the user's language, with photo URLs. */
export function localizeEditorOptions(data: EditorOptionsData, locale: string): EditorOptions {
  return {
    customers: data.customers.map(({ id, companyName, country, active }) => ({ id, companyName, country, active })),
    models: data.models.map((model) => ({
      id: model.id,
      code: model.code,
      name: pickLocalized(model.name, locale),
      photoUrl: model.photoPath ? fileUrl(model.photoPath, { thumb: true }) : null,
      active: model.active,
      presets: model.presets,
    })),
    pieceTypes: data.pieceTypes.map((type) => ({
      id: type.id,
      code: type.code,
      seats: type.seats,
      isAccessory: type.isAccessory,
      name: pickLocalized(type.name, locale),
      shortName: pickLocalized(type.shortName, locale) || pickLocalized(type.name, locale),
    })),
    fabrics: data.fabrics.map((fabric) => ({ ...fabric, label: fabricLabel(fabric) })),
    labelTemplates: data.labelTemplates.map((template) => ({
      id: template.id,
      name: pickLocalized(template.name, locale),
      active: template.active,
    })),
    catalog: data.catalog,
  };
}

/**
 * The last proforma issue of an order and whether the saved order changed
 * since (its content fingerprint differs from the issue's).
 */
export async function getOrderIssueState(graph: OrderGraph) {
  const issuer = alias(user, "issuer");
  const [[last], notes] = await Promise.all([
    db
      .select({
        number: documentIssues.number,
        revision: documentIssues.revision,
        language: documentIssues.language,
        issuedAt: documentIssues.issuedAt,
        contentHash: documentIssues.contentHash,
        issuedByName: issuer.name,
      })
      .from(documentIssues)
      .leftJoin(issuer, eq(issuer.id, documentIssues.issuedBy))
      .where(and(eq(documentIssues.orderId, graph.order.id), eq(documentIssues.docType, "proforma")))
      .orderBy(desc(documentIssues.revision), desc(documentIssues.issuedAt))
      .limit(1),
    db
      .select({
        title: orderReferenceNotes.title,
        body: orderReferenceNotes.body,
        photoPath: orderReferenceNotes.photoPath,
        showOn: orderReferenceNotes.showOn,
      })
      .from(orderReferenceNotes)
      .where(eq(orderReferenceNotes.orderId, graph.order.id))
      .orderBy(asc(orderReferenceNotes.position)),
  ]);
  if (!last) return { last: null, changedSinceIssue: false };
  const { contentHash: hash, ...rest } = last;
  return {
    last: { ...rest, issuedAt: rest.issuedAt.toISOString() },
    changedSinceIssue: hash !== contentHash(proformaContent(graph, notes)),
  };
}

/** The status a cancelled order was cancelled from (its last cancel in the audit trail). */
export async function statusBeforeCancel(orderId: string, tx: Pick<Tx, "select"> = db): Promise<OrderStatus | null> {
  const [row] = await tx
    .select({ before: auditLog.before })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, "order"),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, "status_change"),
        sql`${auditLog.after} ->> 'status' = 'cancelled'`,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  const status = row?.before?.status;
  return typeof status === "string" && (ORDER_STATUS_LIST as readonly string[]).includes(status) ? (status as OrderStatus) : null;
}

/** Templates offered on an order of `customerId`: that customer's own first, then the global ones. */
export async function listColumnTemplates(customerId: string) {
  const rows = await db
    .select({
      id: columnTemplates.id,
      name: columnTemplates.name,
      customerId: columnTemplates.customerId,
      isDefault: columnTemplates.isDefault,
      columns: columnTemplates.columns,
    })
    .from(columnTemplates)
    .where(or(eq(columnTemplates.customerId, customerId), isNull(columnTemplates.customerId)))
    .orderBy(sql`${columnTemplates.customerId} is null`, asc(columnTemplates.name));
  return rows.map(({ customerId: owner, ...row }) => ({ ...row, scope: owner ? ("customer" as const) : ("global" as const) }));
}

export type ColumnTemplateOption = Awaited<ReturnType<typeof listColumnTemplates>>[number];

/** The columns of the customer's default template, for its new orders. */
export async function defaultTemplateColumns(customerId: string): Promise<CustomColumn[]> {
  const [row] = await db
    .select({ columns: columnTemplates.columns })
    .from(columnTemplates)
    .where(and(eq(columnTemplates.customerId, customerId), eq(columnTemplates.isDefault, true)));
  return row?.columns ?? [];
}

/** The History tab: audit entries and issued documents of the order, as one timeline. */
export async function getOrderHistory(orderId: string) {
  const issuer = alias(user, "issuer");
  const [audit, issues] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        actorName: user.name,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(and(eq(auditLog.entity, "order"), eq(auditLog.entityId, orderId)))
      .orderBy(desc(auditLog.createdAt)),
    db
      .select({
        id: documentIssues.id,
        docType: documentIssues.docType,
        number: documentIssues.number,
        revision: documentIssues.revision,
        language: documentIssues.language,
        issuedAt: documentIssues.issuedAt,
        issuedByName: issuer.name,
      })
      .from(documentIssues)
      .leftJoin(issuer, eq(issuer.id, documentIssues.issuedBy))
      .where(eq(documentIssues.orderId, orderId)),
  ]);
  return buildHistory(audit, issues);
}
