/**
 * Saving lines by diff (syncOrderLines), the proforma fingerprint, and the
 * immutability of issued documents — against the test database
 * (DATABASE_URL_TEST, migrated by test/vitest-global-setup.ts), never the
 * development one. Every test runs in a transaction that is rolled back.
 * Skipped when no test database is configured.
 */
import path from "node:path";

import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "@/db";
import * as schema from "@/db/schema";

import { contentHash, proformaContent } from "./issue";
import { loadOrderGraph, syncOrderLines, type LineToWrite } from "./persist";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const url = process.env.DATABASE_URL_TEST;

const client = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;
const db = client ? drizzle(client, { schema }) : null;

afterAll(async () => {
  await client?.end();
});

class Rollback extends Error {}

async function inRollback(work: (tx: Tx) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const suffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** A customer, a model, two piece types and an empty order, all inside `tx`. */
async function setUp(tx: Tx) {
  const tag = suffix();
  const [customer] = await tx.insert(schema.customers).values({ companyName: `SYNC ${tag}`, country: "TR" }).returning();
  const [model] = await tx.insert(schema.models).values({ code: `SYNC-${tag}`, name: { tr: "Sync" } }).returning();
  const [seat3, seat1] = await tx
    .insert(schema.pieceTypes)
    .values([
      { code: `S3-${tag}`, seats: 3, name: { tr: "Üçlü" } },
      { code: `S1-${tag}`, seats: 1, name: { tr: "Tekli" } },
    ])
    .returning();
  const [order] = await tx
    .insert(schema.orders)
    .values({
      number: `SYNC-${tag}`,
      baseNumber: `SYNC-${tag}`,
      orderCode: "ZOC",
      customerId: customer.id,
      orderDate: "2031-01-01",
      currency: "USD",
    })
    .returning();
  return { order, model, seat3, seat1 };
}

type Ctx = Awaited<ReturnType<typeof setUp>>;

function line(ctx: Ctx, quantity: number, patch: Partial<LineToWrite> = {}): LineToWrite {
  return {
    id: crypto.randomUUID(),
    modelId: ctx.model.id,
    composition: "3+1",
    quantity,
    unit: "SET",
    unitPrice: "650.00",
    discountPercent: "0",
    unitCbm: null,
    photoPath: null,
    customerNote: null,
    productionNote: null,
    customValues: {},
    fabrics: [{ fabricId: null, freeText: "APOLLO 23" }],
    pieces: [
      { id: crypto.randomUUID(), pieceTypeId: ctx.seat3.id, qtyPerUnit: 1, modelOverrideId: null, fabricOverrideId: null, unitPrice: null },
      { id: crypto.randomUUID(), pieceTypeId: ctx.seat1.id, qtyPerUnit: 1, modelOverrideId: null, fabricOverrideId: null, unitPrice: null },
    ],
    ...patch,
  };
}

async function rowsOf(tx: Tx, orderId: string) {
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const ids = items.map((item) => item.id);
  const pieces = ids.length ? await tx.select().from(schema.orderItemPieces).where(inArray(schema.orderItemPieces.itemId, ids)) : [];
  const fabrics = ids.length ? await tx.select().from(schema.orderItemFabrics).where(inArray(schema.orderItemFabrics.itemId, ids)) : [];
  return { items, pieces, fabrics };
}

/** now() is the transaction's start time; move the clock so "untouched" is visible in updated_at. */
async function laterSave<T>(tx: Tx, work: () => Promise<T>): Promise<T> {
  await tx.execute(sql`select pg_sleep(0.01)`);
  return work();
}

describe.skipIf(!db)("syncOrderLines (save by diff)", () => {
  it("saving twice with one changed line leaves the other lines' rows untouched", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      const lines = [line(ctx, 10), line(ctx, 20), line(ctx, 30)];
      await syncOrderLines(tx, ctx.order.id, lines, null);
      const first = await rowsOf(tx, ctx.order.id);

      // Second save: line 2's quantity changes, the rest is sent unchanged.
      const changed = lines.map((entry, index) => (index === 1 ? { ...entry, quantity: 21 } : entry));
      await laterSave(tx, () => syncOrderLines(tx, ctx.order.id, changed, null));
      const second = await rowsOf(tx, ctx.order.id);

      const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
      const before = byId(first.items);
      for (const item of second.items) {
        const was = before.get(item.id)!;
        expect(was, "same ids").toBeDefined();
        expect(item.createdAt).toEqual(was.createdAt);
        if (item.id === lines[1].id) {
          expect(item.quantity).toBe(21);
          expect(item.version).toBe(was.version + 1);
        } else {
          expect(item.updatedAt).toEqual(was.updatedAt);
          expect(item.version).toBe(was.version);
        }
      }
      // Pieces and fabrics of every line keep their rows (same ids, created_at, version).
      const pieces = byId(first.pieces);
      expect(second.pieces).toHaveLength(first.pieces.length);
      for (const piece of second.pieces) {
        expect(piece.createdAt).toEqual(pieces.get(piece.id)!.createdAt);
        expect(piece.version).toBe(pieces.get(piece.id)!.version);
      }
      expect(byId(second.fabrics).size).toBe(first.fabrics.length);
      for (const fabric of second.fabrics) expect(byId(first.fabrics).get(fabric.id)!.version).toBe(fabric.version);
    });
  });

  it("a row referenced by a foreign key survives a save that doesn't remove it", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      // Stand-in for Phase 7's loading ticks on order_item_pieces. A real table (temp tables can't
      // reference permanent ones); DDL is transactional, so the rollback drops it again.
      await tx.execute(sql`create table sync_test_ticks (piece_id uuid not null references order_item_pieces(id))`);
      const lines = [line(ctx, 5), line(ctx, 6)];
      await syncOrderLines(tx, ctx.order.id, lines, null);
      const ticked = lines[0].pieces[0].id;
      await tx.execute(sql`insert into sync_test_ticks values (${ticked})`);

      // Change everything about the ticked line except its piece, reorder, add and remove lines.
      const next = [
        line(ctx, 7),
        { ...lines[0], quantity: 50, composition: "3+1", pieces: [{ ...lines[0].pieces[0], qtyPerUnit: 2 }] },
      ];
      await syncOrderLines(tx, ctx.order.id, next, null);
      const after = await rowsOf(tx, ctx.order.id);
      expect(after.pieces.find((piece) => piece.id === ticked)?.qtyPerUnit).toBe(2);
      expect(after.items.map((item) => item.id).sort()).toEqual([next[0].id, lines[0].id].sort());
      expect(after.items.find((item) => item.id === lines[0].id)?.position).toBe(1);
    });
  });

  it("removing a referenced row is still refused by its foreign key (the row really is deleted, not kept)", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      await tx.execute(sql`create table sync_test_ticks (piece_id uuid not null references order_item_pieces(id))`);
      const lines = [line(ctx, 5)];
      await syncOrderLines(tx, ctx.order.id, lines, null);
      await tx.execute(sql`insert into sync_test_ticks values (${lines[0].pieces[0].id})`);
      await expect(tx.transaction((inner) => syncOrderLines(inner, ctx.order.id, [], null))).rejects.toThrow();
    });
  });

  it("matches fabrics by position: changes update in place, extra ones are added or removed", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      const first = line(ctx, 1, {
        fabrics: [
          { fabricId: null, freeText: "A" },
          { fabricId: null, freeText: "B" },
        ],
      });
      await syncOrderLines(tx, ctx.order.id, [first], null);
      const before = (await rowsOf(tx, ctx.order.id)).fabrics.sort((a, b) => a.position - b.position);

      await syncOrderLines(tx, ctx.order.id, [{ ...first, fabrics: [{ fabricId: null, freeText: "C" }] }], null);
      const after = (await rowsOf(tx, ctx.order.id)).fabrics;
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before[0].id);
      expect(after[0].freeText).toBe("C");
    });
  });

  it("never updates or deletes rows of another order", async () => {
    await inRollback(async (tx) => {
      const a = await setUp(tx);
      const b = await setUp(tx);
      const lineA = line(a, 1);
      await syncOrderLines(tx, a.order.id, [lineA], null);
      // Order B's payload carries order A's line id: an insert, refused by the primary key.
      await expect(
        tx.transaction((inner) => syncOrderLines(inner, b.order.id, [{ ...line(b, 2), id: lineA.id }], null)),
      ).rejects.toThrow();
      const rowsA = await rowsOf(tx, a.order.id);
      expect(rowsA.items).toHaveLength(1);
      expect(rowsA.items[0].quantity).toBe(1);
    });
  });
});

describe.skipIf(!db)("proforma fingerprint", () => {
  it("changes with what the proforma shows, not with production-only fields", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      const lines = [line(ctx, 3)];
      await syncOrderLines(tx, ctx.order.id, lines, null);
      const hashOf = async () => contentHash(proformaContent((await loadOrderGraph(tx, ctx.order.id))!, []));
      const base = await hashOf();
      expect(await hashOf()).toBe(base);

      await syncOrderLines(tx, ctx.order.id, [{ ...lines[0], productionNote: { tr: "Ayaklar altın" } }], null);
      await tx.update(schema.orders).set({ status: "confirmed", productionNotes: { tr: "Acil" } }).where(eq(schema.orders.id, ctx.order.id));
      expect(await hashOf()).toBe(base);

      await syncOrderLines(tx, ctx.order.id, [{ ...lines[0], productionNote: { tr: "Ayaklar altın" }, unitPrice: "655.00" }], null);
      expect(await hashOf()).not.toBe(base);
    });
  });
});

describe.skipIf(!db)("document_issues", () => {
  it("can't be modified or deleted once issued", async () => {
    await inRollback(async (tx) => {
      const ctx = await setUp(tx);
      const [issue] = await tx
        .insert(schema.documentIssues)
        .values({ orderId: ctx.order.id, docType: "proforma", number: ctx.order.number, language: "en", snapshot: { a: 1 } })
        .returning();
      await expect(
        tx.transaction((inner) => inner.update(schema.documentIssues).set({ language: "ar" }).where(eq(schema.documentIssues.id, issue.id))),
      ).rejects.toThrow();
      await expect(
        tx.transaction((inner) =>
          inner.update(schema.documentIssues).set({ snapshot: { a: 2 } }).where(eq(schema.documentIssues.id, issue.id)),
        ),
      ).rejects.toThrow();
      await expect(
        tx.transaction((inner) => inner.update(schema.documentIssues).set({ number: "X" }).where(eq(schema.documentIssues.id, issue.id))),
      ).rejects.toThrow();
      await expect(
        tx.transaction((inner) => inner.delete(schema.documentIssues).where(eq(schema.documentIssues.id, issue.id))),
      ).rejects.toThrow();
    });
  });
});
