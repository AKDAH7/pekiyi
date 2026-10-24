import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { documentIssues, fabrics, models, orderReferenceNotes, pieceTypes } from "@/db/schema";
import { todayInTurkey } from "@/lib/format/dates";
import { buildProformaSnapshot, proformaContent } from "@/lib/orders/issue";
import { loadIssueContext } from "@/lib/orders/issue-context";
import { fabricLabel, loadOrderGraph } from "@/lib/orders/persist";
import { loadDomainCatalog } from "@/lib/orders/queries";
import { documentKey, storage } from "@/lib/storage";

import { proformaFileName, toDocumentLanguage, type DocumentFormat, type DocumentLanguage } from "../languages";

import { CONTENT_TYPES, renderProforma } from "./render";
import { parseProformaSnapshot, type ProformaSnapshot, type SnapshotNames } from "./snapshot";
import { buildProformaViewModel } from "./view-model";

export type DocumentFile = { body: Buffer; fileName: string; contentType: string };

/**
 * The current catalog's names for what a snapshot from before names were
 * frozen (snapshot version 1) references. Newer snapshots have their own.
 */
async function fallbackNames(snapshot: ProformaSnapshot): Promise<SnapshotNames | undefined> {
  if (snapshot.names) return undefined;
  const codes = [...new Set(snapshot.order.lines.flatMap((line) => [line.model, ...line.pieces.flatMap((piece) => piece.modelOverride ?? [])]))];
  const [modelRows, typeRows, fabricRows] = await Promise.all([
    codes.length === 0 ? [] : db.select({ code: models.code, name: models.name }).from(models).where(inArray(models.code, codes)),
    db
      .select({ code: pieceTypes.code, name: pieceTypes.name, shortName: pieceTypes.shortName, isAccessory: pieceTypes.isAccessory, sort: pieceTypes.sort })
      .from(pieceTypes),
    db.select({ brand: fabrics.brand, code: fabrics.code, colorName: fabrics.colorName }).from(fabrics),
  ]);
  return {
    models: Object.fromEntries(modelRows.map((row) => [row.code, row.name])),
    pieceTypes: Object.fromEntries(typeRows.map(({ code, ...row }) => [code, row])),
    fabrics: Object.fromEntries(fabricRows.flatMap((row) => (row.colorName ? [[fabricLabel(row), row.colorName]] : []))),
  };
}

// One render per (issue, language, format) at a time; a second request waits for the first.
const inFlight = new Map<string, Promise<Buffer>>();

/**
 * An issued proforma of `orderId` as a file. Rendered on the first download
 * per (issue, language, format), stored under UPLOAD_DIR and reused: the
 * snapshot never changes, so neither does the file. Null when the issue
 * doesn't exist (or belongs to another order).
 */
export async function issuedProformaFile(
  orderId: string,
  issueId: string,
  requested: DocumentLanguage | undefined,
  format: DocumentFormat,
): Promise<DocumentFile | null> {
  const [issue] = await db
    .select({ id: documentIssues.id, snapshot: documentIssues.snapshot, issuedAt: documentIssues.issuedAt })
    .from(documentIssues)
    .where(and(eq(documentIssues.id, issueId), eq(documentIssues.orderId, orderId), eq(documentIssues.docType, "proforma")));
  if (!issue) return null;
  const snapshot = parseProformaSnapshot(issue.snapshot);
  const language = requested ?? toDocumentLanguage(snapshot.language);
  const fileName = proformaFileName(snapshot.number, snapshot.customer.companyName, language, format);

  const key = documentKey(issue.id, language, format);
  let body = await storage.readDocument(key);
  if (!body) {
    let rendering = inFlight.get(key);
    if (!rendering) {
      rendering = (async () => {
        const model = buildProformaViewModel(snapshot, {
          language,
          invoiceDate: todayInTurkey(issue.issuedAt),
          fallbackNames: await fallbackNames(snapshot),
        });
        const rendered = await renderProforma(model, format, storage);
        await storage.saveDocument(key, rendered);
        // When two servers raced, the first stored file wins; serve that one.
        return (await storage.readDocument(key)) ?? rendered;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, rendering);
    }
    body = await rendering;
  }
  return { body, fileName, contentType: CONTENT_TYPES[format] };
}

/**
 * The draft preview: the proforma built from the order as it is saved now,
 * exactly as issuing would snapshot it, with a DRAFT watermark. Nothing is
 * stored. Null when the order doesn't exist.
 */
export async function draftProformaPdf(orderId: string, requested: DocumentLanguage | undefined): Promise<DocumentFile | null> {
  const graph = await loadOrderGraph(db, orderId);
  if (!graph) return null;
  const [notes, context, catalog] = await Promise.all([
    db
      .select({
        title: orderReferenceNotes.title,
        body: orderReferenceNotes.body,
        photoPath: orderReferenceNotes.photoPath,
        showOn: orderReferenceNotes.showOn,
      })
      .from(orderReferenceNotes)
      .where(eq(orderReferenceNotes.orderId, orderId))
      .orderBy(asc(orderReferenceNotes.position)),
    loadIssueContext(db, graph),
    loadDomainCatalog(),
  ]);
  const language = requested ?? toDocumentLanguage(String(context.customer.docLanguage ?? ""));
  const snapshot = buildProformaSnapshot(graph, proformaContent(graph, notes), {
    number: graph.order.number,
    revision: graph.order.revision,
    language: language === "en-ar" ? "en" : language,
    company: context.company,
    bankAccount: context.bankAccount,
    bankAccounts: context.bankAccounts,
    customer: context.customer,
    names: context.names,
    catalog,
  });
  // Through JSON, like an issued snapshot read back from jsonb.
  const model = buildProformaViewModel(parseProformaSnapshot(JSON.parse(JSON.stringify(snapshot))), {
    language,
    invoiceDate: todayInTurkey(),
    draft: true,
  });
  return {
    body: await renderProforma(model, "pdf", storage),
    fileName: proformaFileName(`${graph.order.number}-DRAFT`, context.customerName, language, "pdf"),
    contentType: CONTENT_TYPES.pdf,
  };
}
