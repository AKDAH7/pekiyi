/**
 * What one order save writes to the audit log: the header fields that
 * changed, and lines added / removed / changed — each line as one readable
 * summary ("VERA 3+2+1 · 5 SET · 470.40 · BOYTEKS 30147203 · SEAT_1→DAMLA"),
 * so the audit page's before → after table reads like a change list.
 *
 * Pure: works on loadOrderGraph() results (lib/orders/persist.ts).
 */
import type { LocalizedText } from "@/db/schema/common";
import { DOC_LANGUAGES } from "@/db/schema/common";

import type { OrderGraph } from "./persist";

type Value = string | number | boolean | null;

export type OrderAuditSnapshot = {
  header: Record<string, Value>;
  lines: { id: string; key: string; summary: string }[];
};

function localized(text: LocalizedText | null): string | null {
  if (!text) return null;
  const parts = DOC_LANGUAGES.filter((lang) => text[lang]).map((lang) => `${lang.toUpperCase()}: ${text[lang]}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

function short(text: LocalizedText | null): string | null {
  const value = text?.tr || text?.en || text?.ar;
  if (!value) return null;
  return value.length > 60 ? `${value.slice(0, 59)}…` : value;
}

/** Names of referenced records, resolved by the caller (ids alone say nothing in the log). */
export type AuditNames = { customer: string; labelTemplate: string | null };

export function orderAuditSnapshot(graph: OrderGraph, names: AuditNames): OrderAuditSnapshot {
  const { order } = graph;
  const options = Object.entries(order.documentOptions)
    .filter(([, on]) => on)
    .map(([key]) => key);
  const header: Record<string, Value> = {
    number: order.number,
    customer: names.customer,
    orderDate: order.orderDate,
    status: order.status,
    currency: order.currency,
    secondaryCurrency: order.secondaryCurrency,
    secondaryRate: order.secondaryRate,
    incoterm: order.incoterm,
    deliveryTime: localized(order.deliveryTime),
    paymentTerms: localized(order.paymentTerms),
    advance:
      order.advanceType === null
        ? null
        : order.advanceType === "percent"
          ? `${order.advanceValue} %`
          : `${order.advanceValue} ${order.currency}`,
    customerNotes: localized(order.customerNotes),
    productionNotes: localized(order.productionNotes),
    sampleApprovalRequired: order.sampleApprovalRequired,
    sampleApprovalText: localized(order.sampleApprovalText),
    documentOptions: options.length > 0 ? options.join(", ") : null,
    labelBranding: order.labelBranding,
    labelTemplate: names.labelTemplate,
    customColumns:
      order.customColumns.length > 0
        ? order.customColumns
            .map((column) => `${short(column.label) ?? column.key} (${[column.type, ...column.showOn].join(", ")})`)
            .join(" · ")
        : null,
  };
  const columnLabel = new Map(order.customColumns.map((column) => [column.key, short(column.label) ?? column.key]));

  const lines = graph.items.map((item, index) => {
    const pieces = item.pieces
      .map((piece) => {
        let text = `${piece.pieceTypeCode}×${piece.qtyPerUnit}`;
        if (piece.modelOverrideCode) text += `→${piece.modelOverrideCode}`;
        if (piece.fabricOverrideLabel) text += ` (${piece.fabricOverrideLabel})`;
        if (piece.unitPrice !== null) text += ` @${piece.unitPrice}`;
        return text;
      })
      .join(", ");
    const parts = [
      [item.modelCode, item.composition].filter(Boolean).join(" "),
      `${item.quantity} ${item.unit}`,
      item.unitPrice === null ? "—" : item.unitPrice,
      Number(item.discountPercent) > 0 ? `-${item.discountPercent}%` : null,
      item.unitCbm === null ? null : `${item.unitCbm} m³`,
      item.fabrics.map((fabric) => fabric.label).join(" / ") || null,
      pieces,
      item.photoPath ? "📷" : null,
      ...Object.entries(item.customValues).flatMap(([key, value]) =>
        value === null || value === "" ? [] : [`${columnLabel.get(key) ?? key}: ${value}`],
      ),
      short(item.customerNote) && `✎ ${short(item.customerNote)}`,
      short(item.productionNote) && `⚒ ${short(item.productionNote)}`,
    ];
    return {
      id: item.id,
      key: `#${index + 1} ${item.modelCode}`,
      summary: parts.filter(Boolean).join(" · "),
    };
  });

  return { header, lines };
}

export type OrderAuditDiff = { before: Record<string, Value> | null; after: Record<string, Value> };

/**
 * Before/after maps for logAudit: only what changed. A brand-new order
 * (`before` null) lists its whole header and every line as added.
 */
export function diffOrderSnapshots(
  before: OrderAuditSnapshot | null,
  after: OrderAuditSnapshot,
): OrderAuditDiff {
  if (before === null) {
    const added: Record<string, Value> = {};
    for (const line of after.lines) added[`${line.key} +`] = line.summary;
    return { before: null, after: { ...after.header, ...added } };
  }

  const old: Record<string, Value> = {};
  const now: Record<string, Value> = {};
  for (const [field, value] of Object.entries(after.header)) {
    if (JSON.stringify(before.header[field] ?? null) !== JSON.stringify(value)) {
      old[field] = before.header[field] ?? null;
      now[field] = value;
    }
  }

  const previous = new Map(before.lines.map((line) => [line.id, line]));
  const current = new Set(after.lines.map((line) => line.id));
  for (const line of after.lines) {
    const was = previous.get(line.id);
    if (!was) now[`${line.key} +`] = line.summary;
    else if (was.summary !== line.summary) {
      old[line.key] = was.summary;
      now[line.key] = line.summary;
    }
  }
  for (const line of before.lines) {
    if (!current.has(line.id)) old[`${line.key} −`] = line.summary;
  }

  // Same lines in a new order: record the sequence once instead of every line.
  const kept = (ids: string[], other: Set<string>) => ids.filter((id) => other.has(id));
  const beforeOrder = kept(before.lines.map((line) => line.id), current);
  const afterOrder = kept(after.lines.map((line) => line.id), new Set(previous.keys()));
  if (beforeOrder.join() !== afterOrder.join()) {
    const label = (ids: string[], lines: OrderAuditSnapshot["lines"]) =>
      ids.map((id) => lines.find((line) => line.id === id)?.key.split(" ")[1] ?? "?").join(", ");
    old.lineOrder = label(beforeOrder, before.lines);
    now.lineOrder = label(afterOrder, after.lines);
  }

  return { before: old, after: now };
}
