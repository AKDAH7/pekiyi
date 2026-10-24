/**
 * Issuing a proforma (the documents are rendered from it by lib/documents).
 *
 * - `proformaContent` is everything of the order the proforma shows:
 *   header terms, lines with pieces and fabrics, customer notes, the custom
 *   columns and reference notes marked for the proforma, document options.
 *   Not in it: status, number/revision, production notes, label settings —
 *   changing those doesn't call for a new proforma revision. Nor the
 *   language: a revision is about content, and every issue can be rendered
 *   in any language.
 * - `contentHash` fingerprints it. Issuing again with the same fingerprint
 *   is refused, and the order page shows "changed since last issue" when the
 *   saved order's fingerprint differs from the last issue's.
 * - `buildProformaSnapshot` adds what the document needs from elsewhere
 *   (company, bank accounts, customer, the names of models / piece types /
 *   fabric colours in all three languages, totals) and is frozen into
 *   document_issues.snapshot, which is never modified afterwards.
 *
 * Pure apart from hashing (node:crypto); server code only.
 */
import { createHash } from "node:crypto";

import type { DocLanguage, LocalizedText } from "@/db/schema/common";
import type { CustomColumn } from "@/db/schema/orders";
import { computeOrderTotals } from "@/lib/domain/totals";
import type { Catalog, OrderForTotals } from "@/lib/domain/types";

import type { OrderGraph } from "./persist";

export type ReferenceNoteForIssue = {
  title: LocalizedText;
  body: LocalizedText | null;
  photoPath: string | null;
  showOn: string[];
};

function proformaColumns(columns: readonly CustomColumn[]): CustomColumn[] {
  return columns.filter((column) => column.showOn.includes("proforma"));
}

/** The order as the proforma shows it; ids, positions and bookkeeping left out. */
export function proformaContent(graph: OrderGraph, referenceNotes: readonly ReferenceNoteForIssue[]) {
  const { order } = graph;
  const columns = proformaColumns(order.customColumns);
  return {
    customerId: order.customerId,
    orderDate: order.orderDate,
    currency: order.currency,
    secondaryCurrency: order.secondaryCurrency,
    secondaryRate: order.secondaryRate,
    incoterm: order.incoterm,
    deliveryTime: order.deliveryTime,
    paymentTerms: order.paymentTerms,
    advanceType: order.advanceType,
    advanceValue: order.advanceValue,
    customerNotes: order.customerNotes,
    sampleApprovalRequired: order.sampleApprovalRequired,
    sampleApprovalText: order.sampleApprovalRequired ? order.sampleApprovalText : null,
    documentOptions: order.documentOptions,
    customColumns: columns,
    lines: graph.items.map((item) => ({
      model: item.modelCode,
      modelId: item.modelId,
      displayName: item.displayName,
      composition: item.composition,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      unitCbm: item.unitCbm,
      photoPath: item.photoPath,
      modelPhotoPath: item.modelPhotoPath,
      customerNote: item.customerNote,
      customValues: Object.fromEntries(
        columns.flatMap((column) => {
          const value = item.customValues[column.key];
          return value === undefined || value === null || value === "" ? [] : [[column.key, value]];
        }),
      ),
      fabrics: item.fabrics.map((fabric) => fabric.label),
      pieces: item.pieces.map((piece) => ({
        pieceType: piece.pieceTypeCode,
        qtyPerUnit: piece.qtyPerUnit,
        modelOverride: piece.modelOverrideCode,
        fabric: piece.fabricOverrideLabel,
        unitPrice: piece.unitPrice,
      })),
    })),
    referenceNotes: referenceNotes
      .filter((note) => note.showOn.includes("proforma"))
      .map(({ title, body, photoPath }) => ({ title, body, photoPath })),
  };
}

export type ProformaContent = ReturnType<typeof proformaContent>;

/** JSON with object keys sorted, so jsonb's key reordering never changes a fingerprint. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function contentHash(content: ProformaContent): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

/** The order's lines in the shape computeOrderTotals takes. */
export function graphToDomain(graph: OrderGraph): OrderForTotals {
  const { order } = graph;
  return {
    currency: order.currency,
    secondaryCurrency: order.secondaryCurrency,
    secondaryRate: order.secondaryRate,
    advanceType: order.advanceType,
    advanceValue: order.advanceValue,
    items: graph.items.map((item) => ({
      model: item.modelCode,
      composition: item.composition,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      unitCbm: item.unitCbm,
      fabrics: item.fabrics.map((fabric) => fabric.label),
      pieces: item.pieces.map((piece) => ({
        pieceType: piece.pieceTypeCode,
        qtyPerUnit: piece.qtyPerUnit,
        modelOverride: piece.modelOverrideCode,
        unitPrice: piece.unitPrice,
        fabric: piece.fabricOverrideLabel,
      })),
    })),
  };
}

/**
 * Names the document prints for the codes and labels the order uses, in
 * every language (lib/orders/issue-context.ts loads them): model names by
 * model code, piece type names by piece type code, fabric colour names by
 * fabric label.
 */
export type DocumentNames = {
  models: Record<string, LocalizedText>;
  pieceTypes: Record<string, { name: LocalizedText; shortName: LocalizedText | null; isAccessory: boolean; sort: number }>;
  fabrics: Record<string, LocalizedText>;
};

export type IssueContext = {
  number: string;
  revision: number;
  /** The language picked when issuing: the default for downloads, not part of the revision. */
  language: DocLanguage;
  company: Record<string, unknown> | null;
  /** The active account for the order currency (required to issue; a draft preview may have none). */
  bankAccount: Record<string, unknown> | null;
  /** Every active account, in display order; the document options pick all or the order currency's. */
  bankAccounts: Record<string, unknown>[];
  customer: Record<string, unknown>;
  names: DocumentNames;
  catalog: Catalog;
};

/** Snapshot layout: 1 = Phase 3.2 (single bank account, no names), 2 = with names and every bank account. */
export const PROFORMA_SNAPSHOT_VERSION = 2;

/** Everything the proforma will be rendered from, frozen at issue time. */
export function buildProformaSnapshot(graph: OrderGraph, content: ProformaContent, context: IssueContext) {
  const totals = computeOrderTotals(graphToDomain(graph), context.catalog);
  return {
    docType: "proforma",
    snapshotVersion: PROFORMA_SNAPSHOT_VERSION,
    number: context.number,
    revision: context.revision,
    language: context.language,
    company: context.company,
    bankAccount: context.bankAccount,
    bankAccounts: context.bankAccounts,
    customer: context.customer,
    names: context.names,
    order: content,
    totals,
  };
}

export type ProformaSnapshotData = ReturnType<typeof buildProformaSnapshot>;

/**
 * Number and revision of the next proforma issue. The first issue keeps the
 * order's current revision (0 = the base number without suffix, or an
 * imported order's REV); every later issue is the last issued revision + 1.
 */
export function nextIssueRevision(orderRevision: number, lastIssuedRevision: number | null): number {
  return lastIssuedRevision === null ? orderRevision : Math.max(orderRevision, lastIssuedRevision + 1);
}
