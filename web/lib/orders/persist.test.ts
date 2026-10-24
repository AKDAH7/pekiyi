/**
 * Order numbering under concurrency, against the test database
 * (DATABASE_URL_TEST, migrated by test/vitest-global-setup.ts) — never the
 * development one. Unlike the other DB tests these transactions must
 * COMMIT (a rolled-back insert can't make the other transaction wait), so
 * the test works on a date far in the future and deletes its rows after.
 * Skipped when no test database is configured.
 */
import path from "node:path";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { DEFAULT_ORDER_NUMBER_PATTERN, DEFAULT_REVISION_SUFFIX } from "@/lib/domain/order-number";

import { allocateOrderNumber } from "./persist";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const url = process.env.DATABASE_URL_TEST;

const client = url ? postgres(url, { max: 6, onnotice: () => {} }) : null;
const db = client ? drizzle(client, { schema }) : null;

const DATE = "2031-05-17";
const OTHER_DATE = "2031-05-18";
const CUSTOMER = "VITEST NUMBERING CUSTOMER";
let customerId = "";

async function cleanUp() {
  const rows = await db!
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.companyName, CUSTOMER));
  for (const row of rows) {
    await db!.delete(schema.orders).where(eq(schema.orders.customerId, row.id));
    await db!.delete(schema.customers).where(eq(schema.customers.id, row.id));
  }
}

beforeAll(async () => {
  if (!db) return;
  await cleanUp();
  const [customer] = await db
    .insert(schema.customers)
    .values({ companyName: CUSTOMER, country: "TR" })
    .returning({ id: schema.customers.id });
  customerId = customer.id;
});

afterAll(async () => {
  if (db) await cleanUp();
  await client?.end();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What createOrderAction does: number + insert in one transaction. */
async function createOrder(date: string, hold = 0): Promise<string> {
  return db!.transaction(async (tx) => {
    const number = await allocateOrderNumber(tx, {
      date,
      orderCode: "ZOC",
      pattern: DEFAULT_ORDER_NUMBER_PATTERN,
      revisionSuffix: DEFAULT_REVISION_SUFFIX,
    });
    // Keep the transaction open a little, so the others really overlap it.
    await sleep(hold);
    await tx.insert(schema.orders).values({
      number,
      baseNumber: number,
      orderCode: "ZOC",
      customerId,
      orderDate: date,
      currency: "USD",
    });
    return number;
  });
}

describe.skipIf(!db)("allocateOrderNumber", () => {
  it("gives orders created at the same moment different numbers", async () => {
    const numbers = await Promise.all([createOrder(DATE, 150), createOrder(DATE, 150), createOrder(DATE, 150)]);
    expect([...numbers].sort()).toEqual(["310517-1ZOC", "310517-2ZOC", "310517-3ZOC"]);
  });

  it("continues after the day's highest number", async () => {
    expect(await createOrder(DATE)).toBe("310517-4ZOC");
  });

  it("skips a number still used by an order whose date was changed later", async () => {
    // An order numbered for the 18th, then moved to the 17th.
    await db!.insert(schema.orders).values({
      number: "310518-1ZOC",
      baseNumber: "310518-1ZOC",
      orderCode: "ZOC",
      customerId,
      orderDate: DATE,
      currency: "USD",
    });
    expect(await createOrder(OTHER_DATE)).toBe("310518-2ZOC");
  });
});
