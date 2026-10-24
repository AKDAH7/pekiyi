"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import type { Tx } from "@/db";
import {
  columnTemplates,
  companySettings,
  customers,
  documentIssues,
  labelTemplates,
  orderReferenceNotes,
  orders,
  pieceTypes,
  type OrderStatus,
} from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { fail, runMutation } from "@/lib/actions";
import { logAudit, rowSnapshot } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { loadVersioned, updateVersioned, VersionConflictError } from "@/lib/db/versioned";
import { dec, sum, toMoney } from "@/lib/domain/decimal";
import { DEFAULT_ORDER_NUMBER_PATTERN, DEFAULT_REVISION_SUFFIX, revisionNumber } from "@/lib/domain/order-number";
import { findTransition } from "@/lib/domain/order-status";
import { todayInTurkey } from "@/lib/format/dates";
import { formDataToObject } from "@/lib/form-data";
import { fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import { diffOrderSnapshots, orderAuditSnapshot } from "@/lib/orders/audit-diff";
import { buildProformaSnapshot, contentHash, nextIssueRevision, proformaContent } from "@/lib/orders/issue";
import { loadIssueContext } from "@/lib/orders/issue-context";
import {
  allocateOrderNumber,
  loadOrderGraph,
  syncOrderLines,
  type LineToWrite,
  type OrderGraph,
} from "@/lib/orders/persist";
import { keepStoredPrices, mayWriteOrderPrices } from "@/lib/orders/price-guard";
import { loadDomainCatalog, statusBeforeCancel } from "@/lib/orders/queries";
import { storage, StorageError } from "@/lib/storage";
import { removeImages } from "@/lib/uploads";
import { optionalFile } from "@/lib/validation/common";
import {
  changeStatusSchema,
  createOrderSchema,
  deleteColumnTemplateSchema,
  duplicateOrderSchema,
  issueProformaSchema,
  saveColumnTemplateSchema,
  updateOrderSchema,
  type OrderData,
} from "@/lib/validation/orders";

// Every action: zod → requirePermission (+ the price rule) → one transaction
// (optimistic locking + one logAudit entry) via runMutation.

/** Result of a save: the order's new version, so the editor can keep editing without a reload. */
export type OrderSaveState = FormState & { version?: number };

const NOT_FOUND = { kind: "form", key: "recordNotFound" } as const;

type Header = OrderData["header"];

/** Header columns of the orders table, without the price fields (advance). Status has its own action. */
function headerColumns(header: Header) {
  return {
    customerId: header.customerId,
    orderDate: header.orderDate,
    currency: header.currency,
    secondaryCurrency: header.secondaryCurrency,
    secondaryRate: header.secondaryRate,
    incoterm: header.incoterm,
    deliveryTime: header.deliveryTime,
    paymentTerms: header.paymentTerms,
    customerNotes: header.customerNotes,
    productionNotes: header.productionNotes,
    sampleApprovalRequired: header.sampleApprovalRequired,
    sampleApprovalText: header.sampleApprovalRequired ? header.sampleApprovalText : null,
    documentOptions: header.documentOptions,
    labelBranding: header.labelBranding,
    labelTemplateId: header.labelTemplateId,
    customColumns: header.customColumns,
  };
}

function advanceColumns(header: Header) {
  const mode = header.advanceMode ?? "none";
  return mode === "none"
    ? { advanceType: null, advanceValue: null }
    : { advanceType: mode, advanceValue: header.advanceValue ?? null };
}

/** A line with its price fields as sent (orderPrices.update) or as kept from the stored order (others). */
type PricedItem = OrderData["items"][number];

/**
 * Lines as stored. With per-piece pricing the set price is the sum of its
 * piece prices (when every non-accessory piece has one), so documents
 * never show a set price that disagrees with its pieces.
 */
async function linesToWrite(tx: Tx, items: readonly PricedItem[], piecePricing: boolean): Promise<LineToWrite[]> {
  const accessories = piecePricing
    ? new Set(
        (await tx.select({ id: pieceTypes.id }).from(pieceTypes).where(eq(pieceTypes.isAccessory, true))).map(
          (row) => row.id,
        ),
      )
    : new Set<string>();

  return items.map((item) => {
    const pieces = item.pieces.map((piece) => ({ ...piece, unitPrice: piece.unitPrice ?? null }));
    let unitPrice = item.unitPrice ?? null;
    if (piecePricing && pieces.some((piece) => piece.unitPrice !== null)) {
      const complete = pieces.every((piece) => piece.unitPrice !== null || accessories.has(piece.pieceTypeId));
      if (complete) {
        unitPrice = toMoney(
          sum(pieces.flatMap((piece) => (piece.unitPrice === null ? [] : [dec(piece.unitPrice).times(piece.qtyPerUnit)]))),
        );
      }
    }
    return {
      id: item.id,
      modelId: item.modelId,
      composition: item.composition,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice,
      discountPercent: item.discountPercent ?? "0",
      unitCbm: item.unitCbm ?? null,
      photoPath: item.photoPath,
      customerNote: item.customerNote,
      productionNote: item.productionNote,
      customValues: item.customValues,
      fabrics: item.fabrics,
      pieces,
    };
  });
}

async function auditSnapshot(tx: Tx, graph: OrderGraph) {
  const [[customer], [template]] = await Promise.all([
    tx.select({ name: customers.companyName }).from(customers).where(eq(customers.id, graph.order.customerId)),
    graph.order.labelTemplateId
      ? tx.select({ name: labelTemplates.name }).from(labelTemplates).where(eq(labelTemplates.id, graph.order.labelTemplateId))
      : Promise.resolve([]),
  ]);
  return orderAuditSnapshot(graph, {
    customer: customer?.name ?? graph.order.customerId,
    labelTemplate: template ? (template.name.tr ?? template.name.en ?? template.name.ar ?? null) : null,
  });
}

async function numberingSettings(tx: Tx) {
  const [settings] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
  return {
    orderCode: settings?.orderCode ?? "",
    pattern: settings?.orderNumberPattern ?? DEFAULT_ORDER_NUMBER_PATTERN,
    revisionSuffix: settings?.revisionSuffix ?? DEFAULT_REVISION_SUFFIX,
  };
}

/** Photos a save dropped from the order; deleted once the save has committed. */
function droppedPhotos(before: OrderGraph, after: OrderGraph): string[] {
  const kept = new Set(after.items.map((item) => item.photoPath));
  return before.items.flatMap((item) => (item.photoPath && !kept.has(item.photoPath) ? [item.photoPath] : []));
}

/** First save of a new order: numbers it (safe under concurrency) and opens it. */
export async function createOrderAction(payload: unknown): Promise<OrderSaveState> {
  const parsed = createOrderSchema.safeParse(payload);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("orders", "create");
  if (!mayWriteOrderPrices(actor.role, parsed.data)) forbidden();
  const { header, items } = parsed.data;
  const advance = can(actor.role, "orderPrices", "update")
    ? advanceColumns(header)
    : advanceColumns({ ...header, advanceMode: "none" });

  let createdId = "";
  const state = await runMutation(
    async (tx) => {
      const numbering = await numberingSettings(tx);
      const number = await allocateOrderNumber(tx, { date: header.orderDate, ...numbering });
      const [created] = await tx
        .insert(orders)
        .values({
          ...headerColumns(header),
          ...advance,
          number,
          baseNumber: number,
          revision: 0,
          orderCode: numbering.orderCode,
          createdBy: actor.id,
        })
        .returning({ id: orders.id });
      createdId = created.id;
      await syncOrderLines(
        tx,
        created.id,
        await linesToWrite(tx, items, header.documentOptions.showPiecePrices),
        actor.id,
      );

      const graph = (await loadOrderGraph(tx, created.id))!;
      const diff = diffOrderSnapshots(null, await auditSnapshot(tx, graph));
      await logAudit(tx, { userId: actor.id, entity: "order", entityId: created.id, action: "create", after: diff.after });
    },
    { inUse: NOT_FOUND, refresh: false },
  );

  if (state.status !== "success") return state;
  redirect({ href: `/orders/${createdId}`, locale: await getLocale() });
  return state;
}

/**
 * Saves header + lines + pieces + fabrics as one unit, guarded by the
 * order's single version. Lines are written by diff (syncOrderLines), so
 * unchanged rows keep their identity and timestamps.
 */
export async function saveOrderAction(payload: unknown): Promise<OrderSaveState> {
  const parsed = updateOrderSchema.safeParse(payload);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("orders", "update");
  if (!mayWriteOrderPrices(actor.role, parsed.data)) forbidden();
  const canPrice = can(actor.role, "orderPrices", "update");
  const { id, version, header, items } = parsed.data;

  let newVersion = version;
  let obsoletePhotos: string[] = [];
  const state = await runMutation(
    async (tx) => {
      const before = await loadOrderGraph(tx, id);
      if (!before || before.order.version !== version) throw new VersionConflictError("orders", id);
      const beforeSnapshot = await auditSnapshot(tx, before);

      const priced: PricedItem[] = canPrice ? items : keepStoredPrices(items, before);
      const advance = canPrice
        ? advanceColumns(header)
        : { advanceType: before.order.advanceType, advanceValue: before.order.advanceValue };

      const updated = await updateVersioned(tx, orders, { id, version }, { ...headerColumns(header), ...advance });
      newVersion = updated.version;
      await syncOrderLines(tx, id, await linesToWrite(tx, priced, header.documentOptions.showPiecePrices), actor.id);

      const after = (await loadOrderGraph(tx, id))!;
      const diff = diffOrderSnapshots(beforeSnapshot, await auditSnapshot(tx, after));
      await logAudit(tx, {
        userId: actor.id,
        entity: "order",
        entityId: id,
        action: "update",
        before: diff.before,
        after: diff.after,
      });
      obsoletePhotos = droppedPhotos(before, after);
    },
    { inUse: NOT_FOUND, refresh: false },
  );

  if (state.status !== "success") return state;
  await removeImages(obsoletePhotos);
  return { ...state, version: newVersion };
}

/**
 * "Duplicate order": a new order (new number for today, revision 0, status
 * offer) with the same customer, header, custom columns and lines — for
 * repeat customers. Line photos are copied, so each order owns its files.
 */
export async function duplicateOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = duplicateOrderSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("orders", "create");
  const copiedPhotos: string[] = [];

  let createdId = "";
  const state = await runMutation(
    async (tx) => {
      const source = await loadOrderGraph(tx, parsed.data.id);
      if (!source) throw new VersionConflictError("orders", parsed.data.id);
      const numbering = await numberingSettings(tx);
      const today = todayInTurkey();
      const number = await allocateOrderNumber(tx, { date: today, ...numbering });

      const { order } = source;
      const [created] = await tx
        .insert(orders)
        .values({
          number,
          baseNumber: number,
          revision: 0,
          orderCode: numbering.orderCode,
          customerId: order.customerId,
          status: "offer",
          orderDate: today,
          currency: order.currency,
          secondaryCurrency: order.secondaryCurrency,
          secondaryRate: order.secondaryRate,
          incoterm: order.incoterm,
          deliveryTime: order.deliveryTime,
          paymentTerms: order.paymentTerms,
          advanceType: order.advanceType,
          advanceValue: order.advanceValue,
          customerNotes: order.customerNotes,
          productionNotes: order.productionNotes,
          sampleApprovalRequired: order.sampleApprovalRequired,
          sampleApprovalText: order.sampleApprovalText,
          documentOptions: order.documentOptions,
          labelBranding: order.labelBranding,
          labelTemplateId: order.labelTemplateId,
          customColumns: order.customColumns,
          createdBy: actor.id,
        })
        .returning({ id: orders.id });
      createdId = created.id;

      const lines: LineToWrite[] = [];
      for (const item of source.items) {
        let photoPath: string | null = null;
        if (item.photoPath) {
          const file = await storage.read(item.photoPath);
          if (file) {
            photoPath = await storage.saveImage(new Blob([new Uint8Array(file.body)], { type: file.contentType }), "orders");
            copiedPhotos.push(photoPath);
          }
        }
        lines.push({
          ...item,
          id: crypto.randomUUID(),
          photoPath,
          fabrics: item.fabrics.map(({ fabricId, freeText }) => ({ fabricId, freeText })),
          pieces: item.pieces.map((piece) => ({ ...piece, id: crypto.randomUUID() })),
        });
      }
      await syncOrderLines(tx, created.id, lines, actor.id);

      const graph = (await loadOrderGraph(tx, created.id))!;
      const diff = diffOrderSnapshots(null, await auditSnapshot(tx, graph));
      await logAudit(tx, {
        userId: actor.id,
        entity: "order",
        entityId: created.id,
        action: "create",
        after: { duplicatedFrom: order.number, ...diff.after },
      });
    },
    { inUse: NOT_FOUND, refresh: false },
  );

  if (state.status !== "success") {
    for (const key of copiedPhotos) await storage.remove(key);
    return state;
  }
  redirect({ href: `/orders/${createdId}`, locale: await getLocale() });
  return state;
}

/**
 * Changes the status along the allowed flow (lib/domain/order-status.ts).
 * Moving back is for `orders.revertStatus` (admin) and needs a reason; both
 * the note and the reason go into the audit entry.
 */
export async function changeOrderStatusAction(payload: unknown): Promise<OrderSaveState> {
  const parsed = changeStatusSchema.safeParse(payload);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("orders", "update");
  const { id, version, to, note, reason } = parsed.data;
  const mayStepBack = can(actor.role, "orders", "revertStatus");

  let newVersion = version;
  const state = await runMutation(
    async (tx) => {
      const order = await loadVersioned(tx, orders, { id, version });
      const transition = findTransition(order.status, to, {
        mayStepBack,
        cancelledFrom: order.status === "cancelled" ? await statusBeforeCancel(id, tx) : null,
      });
      if (!transition) fail({ kind: "form", key: "statusNotAllowed" });
      if (transition.move === "back" && !reason) fail({ kind: "field", field: "reason", key: "required" });

      const updated = await updateVersioned(tx, orders, { id, version }, { status: to });
      newVersion = updated.version;
      await logAudit(tx, {
        userId: actor.id,
        entity: "order",
        entityId: id,
        action: "status_change",
        before: { status: order.status },
        after: {
          status: to,
          ...(note ? { note } : {}),
          ...(transition.move === "back" ? { reason } : {}),
        },
      });
    },
    { inUse: NOT_FOUND },
  );

  if (state.status !== "success") return state;
  return { ...state, version: newVersion };
}

/**
 * "Issue proforma": freezes everything the proforma needs into
 * document_issues (never modified afterwards). The first issue keeps the
 * order's number; each later one — only after a change — is the next
 * revision, and the order's number becomes base + "-REV{N}". An offer
 * becomes a proforma.
 */
export async function issueProformaAction(payload: unknown): Promise<OrderSaveState> {
  const parsed = issueProformaSchema.safeParse(payload);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("proformas", "create");
  const { id, version, language } = parsed.data;
  const catalog = await loadDomainCatalog();

  let newVersion = version;
  const state = await runMutation(
    async (tx) => {
      const graph = await loadOrderGraph(tx, id);
      if (!graph || graph.order.version !== version) throw new VersionConflictError("orders", id);
      const { order } = graph;
      if (order.status === "cancelled") fail({ kind: "form", key: "issueCancelled" });
      if (graph.items.length === 0) fail({ kind: "form", key: "issueNoLines" });

      const notes = await tx
        .select({
          title: orderReferenceNotes.title,
          body: orderReferenceNotes.body,
          photoPath: orderReferenceNotes.photoPath,
          showOn: orderReferenceNotes.showOn,
        })
        .from(orderReferenceNotes)
        .where(eq(orderReferenceNotes.orderId, id))
        .orderBy(orderReferenceNotes.position);
      const content = proformaContent(graph, notes);
      const hash = contentHash(content);

      // Only the content counts: issuing the same content in another language is not a new revision
      // (every issue can be downloaded in any language).
      const [last] = await tx
        .select({ revision: documentIssues.revision, contentHash: documentIssues.contentHash })
        .from(documentIssues)
        .where(and(eq(documentIssues.orderId, id), eq(documentIssues.docType, "proforma")))
        .orderBy(desc(documentIssues.revision), desc(documentIssues.issuedAt))
        .limit(1);
      if (last && last.contentHash === hash) fail({ kind: "form", key: "nothingChanged" });

      const context = await loadIssueContext(tx, graph);
      if (!context.bankAccount) fail({ kind: "form", key: "noBankAccount" });

      const revision = nextIssueRevision(order.revision, last?.revision ?? null);
      const revisionSuffix = typeof context.company?.revisionSuffix === "string" ? context.company.revisionSuffix : DEFAULT_REVISION_SUFFIX;
      const number = revisionNumber(order.baseNumber, revision, revisionSuffix);
      const snapshot = buildProformaSnapshot(graph, content, {
        number,
        revision,
        language,
        company: context.company,
        bankAccount: context.bankAccount,
        bankAccounts: context.bankAccounts,
        customer: context.customer,
        names: context.names,
        catalog,
      });

      await tx.insert(documentIssues).values({
        orderId: id,
        docType: "proforma",
        number,
        revision,
        language,
        snapshot,
        contentHash: hash,
        issuedBy: actor.id,
      });
      const status: OrderStatus = order.status === "offer" ? "proforma" : order.status;
      const updated = await updateVersioned(tx, orders, { id, version }, { number, revision, status });
      newVersion = updated.version;

      await logAudit(tx, {
        userId: actor.id,
        entity: "order",
        entityId: id,
        action: "issue",
        before: { number: order.number, ...(status !== order.status ? { status: order.status } : {}) },
        after: { document: "proforma", number, revision, language, ...(status !== order.status ? { status } : {}) },
      });
    },
    { inUse: NOT_FOUND },
  );

  if (state.status !== "success") return state;
  return { ...state, version: newVersion };
}

/**
 * Saves the order's current custom columns as a named template — for every
 * customer, or for this order's customer (optionally as its default, which
 * new orders for that customer start with).
 */
export async function saveColumnTemplateAction(payload: unknown): Promise<FormState> {
  const parsed = saveColumnTemplateSchema.safeParse(payload);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("orders", "update");
  const { name, scope, customerId, isDefault, columns } = parsed.data;

  return runMutation(
    async (tx) => {
      const owner = scope === "customer" ? customerId : null;
      if (owner && isDefault) {
        await tx
          .update(columnTemplates)
          .set({ isDefault: false, version: sql`${columnTemplates.version} + 1` })
          .where(and(eq(columnTemplates.customerId, owner), eq(columnTemplates.isDefault, true)));
      }
      const [created] = await tx
        .insert(columnTemplates)
        .values({ name, customerId: owner, isDefault, columns, createdBy: actor.id })
        .returning();
      await logAudit(tx, {
        userId: actor.id,
        entity: "column_template",
        entityId: created.id,
        action: "create",
        after: rowSnapshot(created),
      });
    },
    {
      unique: { column_templates_scope_name_unique: { kind: "field", field: "name", key: "templateNameTaken" } },
      inUse: NOT_FOUND,
    },
  );
}

export async function deleteColumnTemplateAction(payload: unknown): Promise<FormState> {
  const parsed = deleteColumnTemplateSchema.safeParse(payload);
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("orders", "update");
  return runMutation(async (tx) => {
    const [deleted] = await tx.delete(columnTemplates).where(eq(columnTemplates.id, parsed.data.id)).returning();
    if (!deleted) fail(NOT_FOUND);
    await logAudit(tx, {
      userId: actor.id,
      entity: "column_template",
      entityId: deleted.id,
      action: "delete",
      before: rowSnapshot(deleted),
    });
  });
}

const photoSchema = z.object({ photo: optionalFile });

export type PhotoUploadResult = { key: string } | { error: string };

/**
 * Stores a line photo chosen in the grid and returns its key; the order
 * save then references it. Photos removed again by a later save are
 * deleted at that point; never-saved uploads by `pnpm files:cleanup`.
 */
export async function uploadOrderPhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  const parsed = photoSchema.safeParse(formDataToObject(formData));
  const t = await getTranslations("validation");
  if (!parsed.success || !parsed.data.photo) return { error: t("imageEmpty") };

  await requirePermission("orders", "update");
  try {
    return { key: await storage.saveImage(parsed.data.photo, "orders") };
  } catch (error) {
    if (error instanceof StorageError) {
      const keys = { empty: "imageEmpty", tooLarge: "imageTooLarge", notAnImage: "notAnImage" } as const;
      return { error: t(keys[error.code]) };
    }
    throw error;
  }
}
