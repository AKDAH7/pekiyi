/**
 * `pnpm db:seed:check` — proves against a real database that re-running
 * the seed never overwrites values edited in the app:
 *   1. seed, 2. edit seeded values (EUR IBAN, ZERDA 3-seater price, order
 *   code, a fixture customer's phone), 3. seed again, 4. assert the edits
 *   survived and no rows were added, 5. restore the original values.
 * It seeds the fixtures too, then reloads the sample orders from the DB and
 * checks they still produce the JSON's expected totals.
 *
 * Runs against the TEST database (DATABASE_URL_TEST, created and migrated
 * here when needed), never DATABASE_URL: it edits rows while it runs.
 */
import assert from "node:assert/strict";

import { ensureTestDatabase, migrateTestDatabase, testDatabaseUrl } from "../test/test-db";

async function main() {
  const url = testDatabaseUrl();
  await ensureTestDatabase(url);
  await migrateTestDatabase(url);

  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { and, asc, eq, sql } = await import("drizzle-orm");
  const { alias } = await import("drizzle-orm/pg-core");
  const schema = await import("./schema");
  const { loadSeedData, catalogFromSeed } = await import("./seed/data");
  const { seedReferenceData } = await import("./seed/reference");
  const { seedFixtures } = await import("./seed/fixtures");
  const { computeOrderTotals } = await import("../lib/domain/totals");
  const { computePieceCounts, countByPieceType } = await import("../lib/domain/piece-counts");

  const queryClient = postgres(url, { onnotice: () => {} });
  const db = drizzle(queryClient, { schema });
  const data = loadSeedData();

  const seedAll = async () => {
    await seedReferenceData(db, data);
    await seedFixtures(db, data);
  };

  const tableCounts = async () => {
    const tables = {
      company_settings: schema.companySettings,
      bank_accounts: schema.bankAccounts,
      exchange_rates: schema.exchangeRates,
      piece_types: schema.pieceTypes,
      models: schema.models,
      model_piece_prices: schema.modelPiecePrices,
      model_presets: schema.modelPresets,
      fabrics: schema.fabrics,
      label_templates: schema.labelTemplates,
      customers: schema.customers,
      orders: schema.orders,
      order_items: schema.orderItems,
    };
    const result: Record<string, number> = {};
    for (const [name, table] of Object.entries(tables)) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
      result[name] = row.n;
    }
    return result;
  };

  await seedAll();
  const before = await tableCounts();

  const [eurAccount] = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.currency, "EUR"));
  const [zerda] = await db
    .select({ id: schema.modelPiecePrices.id, basePrice: schema.modelPiecePrices.basePrice })
    .from(schema.modelPiecePrices)
    .innerJoin(schema.models, eq(schema.models.id, schema.modelPiecePrices.modelId))
    .innerJoin(schema.pieceTypes, eq(schema.pieceTypes.id, schema.modelPiecePrices.pieceTypeId))
    .where(and(eq(schema.models.code, "ZERDA"), eq(schema.pieceTypes.code, "SEAT_3")));
  const [settings] = await db.select().from(schema.companySettings);
  const [hala] = await db.select().from(schema.customers).where(eq(schema.customers.companyName, "HALA FURNITURE"));
  assert.ok(eurAccount && zerda && settings && hala, "seeded rows exist");

  const edited = {
    iban: "TR000000000000000000000099",
    price: "1234.56",
    orderCode: "TST",
    phone: "+31 000 000 000",
  };

  try {
    await db.update(schema.bankAccounts).set({ iban: edited.iban }).where(eq(schema.bankAccounts.id, eurAccount.id));
    await db.update(schema.modelPiecePrices).set({ basePrice: edited.price }).where(eq(schema.modelPiecePrices.id, zerda.id));
    await db.update(schema.companySettings).set({ orderCode: edited.orderCode });
    await db.update(schema.customers).set({ phone: edited.phone }).where(eq(schema.customers.id, hala.id));

    await seedAll();

    const [eurAfter] = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.id, eurAccount.id));
    const [zerdaAfter] = await db.select().from(schema.modelPiecePrices).where(eq(schema.modelPiecePrices.id, zerda.id));
    const [settingsAfter] = await db.select().from(schema.companySettings);
    assert.equal(eurAfter.iban, edited.iban, "EUR IBAN stays edited");
    assert.equal(zerdaAfter.basePrice, edited.price, "ZERDA 3-seater price stays edited");
    assert.equal(settingsAfter.orderCode, edited.orderCode, "order code stays edited");
    const [halaAfter] = await db.select().from(schema.customers).where(eq(schema.customers.id, hala.id));
    assert.equal(halaAfter.phone, edited.phone, "fixture customer phone stays edited");
    assert.deepEqual(await tableCounts(), before, "re-seeding adds no rows");
    console.log("✓ Re-seeding kept every edited value and added no rows.");
  } finally {
    await db.update(schema.bankAccounts).set({ iban: eurAccount.iban }).where(eq(schema.bankAccounts.id, eurAccount.id));
    await db.update(schema.modelPiecePrices).set({ basePrice: zerda.basePrice }).where(eq(schema.modelPiecePrices.id, zerda.id));
    await db.update(schema.companySettings).set({ orderCode: settings.orderCode });
    await db.update(schema.customers).set({ phone: hala.phone }).where(eq(schema.customers.id, hala.id));
    console.log("  (original values restored)");
  }

  const overrideModel = alias(schema.models, "override_model");
  const catalog = catalogFromSeed(data);
  for (const sample of data.sampleOrders) {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.number, sample.number));
    assert.ok(order, `fixture order ${sample.number} exists`);
    const items = await db
      .select({ item: schema.orderItems, model: schema.models.code })
      .from(schema.orderItems)
      .innerJoin(schema.models, eq(schema.models.id, schema.orderItems.modelId))
      .where(eq(schema.orderItems.orderId, order.id))
      .orderBy(asc(schema.orderItems.position));
    const pieces = await db
      .select({
        itemId: schema.orderItemPieces.itemId,
        pieceType: schema.pieceTypes.code,
        qtyPerUnit: schema.orderItemPieces.qtyPerUnit,
        unitPrice: schema.orderItemPieces.unitPrice,
        modelOverride: overrideModel.code,
      })
      .from(schema.orderItemPieces)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderItemPieces.itemId))
      .innerJoin(schema.pieceTypes, eq(schema.pieceTypes.id, schema.orderItemPieces.pieceTypeId))
      .leftJoin(overrideModel, eq(overrideModel.id, schema.orderItemPieces.modelOverrideId))
      .where(eq(schema.orderItems.orderId, order.id))
      .orderBy(asc(schema.orderItemPieces.position));

    const domain = {
      currency: order.currency,
      secondaryCurrency: order.secondaryCurrency,
      secondaryRate: order.secondaryRate,
      advanceType: order.advanceType,
      advanceValue: order.advanceValue,
      items: items.map(({ item, model }) => ({
        model,
        composition: item.composition,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        unitCbm: item.unitCbm,
        fabrics: [],
        pieces: pieces.filter((piece) => piece.itemId === item.id),
      })),
    };
    const totals = computeOrderTotals(domain, catalog);
    const byType = countByPieceType(computePieceCounts(domain));
    const expected = sample.expected;
    assert.equal(totals.total, expected.total.toFixed(2), `${sample.number} total`);
    if (expected.balance !== undefined) assert.equal(totals.balance, expected.balance.toFixed(2));
    if (expected.advance !== undefined) assert.equal(totals.advance, expected.advance.toFixed(2));
    if (expected.totalEur !== undefined) assert.equal(totals.secondary?.total, expected.totalEur.toFixed(2));
    if (expected.cbm !== undefined) assert.equal(totals.totalCbm, expected.cbm.toFixed(3));
    if (expected.seat3 !== undefined) assert.equal(byType.SEAT_3, expected.seat3);
    if (expected.extraCushions !== undefined) assert.equal(byType.CUSHION_EXTRA, expected.extraCushions);
    console.log(`✓ ${sample.number} from the DB: total ${totals.total} ${totals.currency}`);
  }

  await queryClient.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
