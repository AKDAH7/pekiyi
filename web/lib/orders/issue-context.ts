import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import type { Tx } from "@/db";
import { bankAccounts, companySettings, customers, fabrics, models, pieceTypes } from "@/db/schema";
import { rowSnapshot } from "@/lib/audit";

import type { DocumentNames } from "./issue";
import { fabricLabel, type OrderGraph } from "./persist";

/**
 * The names a document prints for what the order references (models,
 * piece types, fabric colours), in all three languages. Only the codes and
 * labels the order uses.
 */
export async function loadDocumentNames(tx: Pick<Tx, "select">, graph: OrderGraph): Promise<DocumentNames> {
  const modelCodes = [
    ...new Set(graph.items.flatMap((item) => [item.modelCode, ...item.pieces.flatMap((piece) => piece.modelOverrideCode ?? [])])),
  ];
  const fabricIds = [
    ...new Set(
      graph.items.flatMap((item) => [
        ...item.fabrics.flatMap((fabric) => fabric.fabricId ?? []),
        ...item.pieces.flatMap((piece) => piece.fabricOverrideId ?? []),
      ]),
    ),
  ];
  const [modelRows, typeRows, fabricRows] = await Promise.all([
    modelCodes.length === 0
      ? []
      : tx.select({ code: models.code, name: models.name }).from(models).where(inArray(models.code, modelCodes)),
    tx
      .select({
        code: pieceTypes.code,
        name: pieceTypes.name,
        shortName: pieceTypes.shortName,
        isAccessory: pieceTypes.isAccessory,
        sort: pieceTypes.sort,
      })
      .from(pieceTypes),
    fabricIds.length === 0
      ? []
      : tx
          .select({ brand: fabrics.brand, code: fabrics.code, colorName: fabrics.colorName })
          .from(fabrics)
          .where(inArray(fabrics.id, fabricIds)),
  ]);
  const usedTypes = new Set(graph.items.flatMap((item) => item.pieces.map((piece) => piece.pieceTypeCode)));
  return {
    models: Object.fromEntries(modelRows.map((row) => [row.code, row.name])),
    pieceTypes: Object.fromEntries(
      typeRows.filter((row) => usedTypes.has(row.code)).map(({ code, ...row }) => [code, row]),
    ),
    fabrics: Object.fromEntries(
      fabricRows.flatMap((row) => (row.colorName ? [[fabricLabel(row), row.colorName]] : [])),
    ),
  };
}

/**
 * What a proforma needs besides the order itself: company, bank accounts,
 * customer and names. Shared by issuing (frozen into the snapshot) and the
 * draft preview (rendered from the live data).
 */
export async function loadIssueContext(tx: Pick<Tx, "select">, graph: OrderGraph) {
  const [[company], accounts, [customer], names] = await Promise.all([
    tx.select().from(companySettings).where(eq(companySettings.id, 1)),
    tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.active, true))
      .orderBy(asc(bankAccounts.sort), asc(bankAccounts.currency)),
    tx.select().from(customers).where(eq(customers.id, graph.order.customerId)),
    loadDocumentNames(tx, graph),
  ]);
  const bankAccount = accounts.find((account) => account.currency === graph.order.currency) ?? null;
  return {
    company: rowSnapshot(company),
    bankAccount: rowSnapshot(bankAccount),
    bankAccounts: accounts.map((account) => rowSnapshot(account)!),
    customer: rowSnapshot(customer)!,
    customerName: customer?.companyName ?? "",
    names,
  };
}
