/**
 * Dev-only fixtures (SEED_FIXTURES=true): the customers and the 4 real
 * sample orders from the seed JSON. Insert-only, like the reference data:
 * an existing customer (by company name) or order (by number) is skipped.
 */
import { eq } from "drizzle-orm";

import { stripRevision } from "../../lib/domain/order-number";
import * as schema from "../schema";

import { resolveFabric, type SampleOrder, type SeedData } from "./data";
import { modelIdsByCode, pieceTypeIdsByCode, type DbOrTx, type SeedDb, type SeedReport } from "./reference";

function orderCodeOf(baseNumber: string): string {
  return /(\p{Lu}[\p{Lu}\p{N}]*)$/u.exec(baseNumber)?.[1] ?? "";
}

async function fabricIdsByLabel(db: DbOrTx, labels: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: schema.fabrics.id, brand: schema.fabrics.brand, code: schema.fabrics.code })
    .from(schema.fabrics);
  const result = new Map<string, string>();
  for (const label of labels) {
    const match = resolveFabric(label, rows);
    if (match) result.set(label, match.id);
  }
  return result;
}

async function insertOrder(
  db: SeedDb,
  order: SampleOrder,
  customerId: string,
  report: SeedReport,
): Promise<void> {
  await db.transaction(async (tx) => {
    const baseNumber = order.baseNumber ?? stripRevision(order.number);
    const advance = order.advance ?? null;
    const [created] = await tx
      .insert(schema.orders)
      .values({
        number: order.number,
        baseNumber,
        revision: order.revision,
        orderCode: orderCodeOf(baseNumber),
        customerId,
        status: "proforma",
        orderDate: order.date,
        currency: order.currency,
        secondaryCurrency: order.secondaryCurrency?.currency ?? null,
        secondaryRate: order.secondaryCurrency ? String(order.secondaryCurrency.usdPerEur) : null,
        incoterm: order.incoterm as schema.Incoterm,
        // The source documents have these in English only.
        deliveryTime: order.deliveryTime ? { en: order.deliveryTime } : null,
        paymentTerms: order.paymentTerms ? { en: order.paymentTerms } : null,
        advanceType: advance === null ? null : "amount" in advance ? "amount" : "percent",
        advanceValue:
          advance === null ? null : String("amount" in advance ? advance.amount : advance.percent),
        customerNotes: order.customerNotes ?? null,
        productionNotes: order.productionNotes ?? null,
        sampleApprovalRequired: order.sampleApprovalRequired !== undefined,
        sampleApprovalText: order.sampleApprovalRequired ?? null,
        documentOptions: order.documentOptions ?? {},
        // "No PEKİYİ name on labels; a metal label with the customer's logo".
        labelBranding: order.labelRequirements ? "customer_logo" : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.orders.id });
    if (!created) return;
    report.orders = (report.orders ?? 0) + 1;

    const modelIds = await modelIdsByCode(tx, [
      ...new Set(
        order.items.flatMap((item) => [
          item.model,
          ...item.pieces.flatMap((piece) => (piece.modelOverride ? [piece.modelOverride] : [])),
        ]),
      ),
    ]);
    const pieceTypeIds = await pieceTypeIdsByCode(tx);
    const fabricIds = await fabricIdsByLabel(
      tx,
      order.items.flatMap((item) => item.fabrics),
    );
    const need = (map: Map<string, string>, key: string, what: string) => {
      const id = map.get(key);
      if (!id) throw new Error(`Order ${order.number}: unknown ${what} "${key}"`);
      return id;
    };

    for (const [position, item] of order.items.entries()) {
      const [row] = await tx
        .insert(schema.orderItems)
        .values({
          orderId: created.id,
          position,
          modelId: need(modelIds, item.model, "model"),
          composition: item.composition,
          quantity: item.qty,
          unit: item.unit,
          unitPrice: String(item.unitPrice),
          unitCbm: item.unitCbm === undefined ? null : String(item.unitCbm),
          customerNote: item.notes?.customer ?? null,
          productionNote: item.notes?.production ?? null,
        })
        .returning({ id: schema.orderItems.id });

      await tx.insert(schema.orderItemPieces).values(
        item.pieces.map((piece, piecePosition) => ({
          itemId: row.id,
          position: piecePosition,
          pieceTypeId: need(pieceTypeIds, piece.pieceType, "piece type"),
          qtyPerUnit: piece.qtyPerUnit,
          modelOverrideId: piece.modelOverride ? need(modelIds, piece.modelOverride, "model") : null,
          unitPrice: piece.unitPrice === undefined ? null : String(piece.unitPrice),
        })),
      );

      await tx.insert(schema.orderItemFabrics).values(
        item.fabrics.map((label, fabricPosition) => {
          const fabricId = fabricIds.get(label) ?? null;
          return {
            itemId: row.id,
            fabricId,
            freeText: fabricId ? null : label,
            role: fabricPosition === 0 ? "main" : "secondary",
            position: fabricPosition,
          };
        }),
      );
    }

    if (order.referenceNotes?.length) {
      // The photos live in the source Excel files; they are attached later.
      await tx.insert(schema.orderReferenceNotes).values(
        order.referenceNotes.map((note, position) => ({
          orderId: created.id,
          position,
          title: note.title,
        })),
      );
    }
  });
}

export async function seedFixtures(db: SeedDb, data: SeedData): Promise<SeedReport> {
  const report: SeedReport = {};
  const customerIds = new Map<string, string>();

  for (const customer of data.customers) {
    const [existing] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.companyName, customer.company))
      .limit(1);
    if (existing) {
      customerIds.set(customer.key, existing.id);
      continue;
    }
    const [created] = await db
      .insert(schema.customers)
      .values({
        companyName: customer.company,
        contactPerson: customer.contactPerson ?? null,
        country: customer.country,
        city: customer.city ?? null,
        address: customer.address ?? null,
        phone: customer.phone,
        email: customer.email ?? null,
        taxIds: customer.taxIds ?? null,
        docLanguage: customer.docLanguage,
        defaultCurrency: customer.currency,
        secondaryCurrency: customer.secondaryCurrency ?? null,
      })
      .returning({ id: schema.customers.id });
    customerIds.set(customer.key, created.id);
    report.customers = (report.customers ?? 0) + 1;
  }

  for (const order of data.sampleOrders) {
    const customerId = customerIds.get(order.customer);
    if (!customerId) throw new Error(`Order ${order.number}: unknown customer "${order.customer}"`);
    await insertOrder(db, order, customerId, report);
  }

  return report;
}
