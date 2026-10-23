import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import {
  pickProductionCustomValues,
  productionCustomColumns,
  productionQueries,
} from "./production-queries";

/** Columns holding money or commercial terms — production must never get them. */
const FORBIDDEN_COLUMNS: [Table, string[]][] = [
  [schema.orderItems, ["unitPrice", "discountPercent", "customerNote"]],
  [schema.orderItemPieces, ["unitPrice"]],
  [schema.modelPiecePrices, ["basePrice", "baseCurrency"]],
  [schema.modelPresets, ["fixedPrice"]],
  [
    schema.orders,
    [
      "currency",
      "secondaryCurrency",
      "secondaryRate",
      "advanceType",
      "advanceValue",
      "paymentTerms",
      "customerNotes",
      "documentOptions",
    ],
  ],
  [schema.payments, ["amount", "currency"]],
];

const FORBIDDEN_TABLES = [
  schema.payments,
  schema.modelPiecePrices,
  schema.modelPresets,
  schema.documentIssues,
  schema.exchangeRates,
  schema.bankAccounts,
].map(getTableName);

const queries = productionQueries(drizzle.mock({ schema }), "00000000-0000-0000-0000-000000000000");
const statements = Object.entries(queries).map(([name, query]) => [name, query.toSQL().sql] as const);

describe("production queries never select price data", () => {
  it.each(statements)("%s: no forbidden column", (_, text) => {
    for (const [table, keys] of FORBIDDEN_COLUMNS) {
      const columns = getTableColumns(table);
      for (const key of keys) {
        const column = columns[key as keyof typeof columns];
        expect(column, `${getTableName(table)}.${key} exists`).toBeDefined();
        expect(text).not.toContain(`"${getTableName(table)}"."${column.name}"`);
      }
    }
  });

  it.each(statements)("%s: no price or payment wording at all", (_, text) => {
    for (const word of ["price", "discount", "total", "advance", "payment", "amount", "rate"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it.each(statements)("%s: no forbidden table", (_, text) => {
    for (const table of FORBIDDEN_TABLES) expect(text).not.toContain(`"${table}"`);
  });

  it("selects explicit columns only", () => {
    for (const [, text] of statements) expect(text).not.toMatch(/select \*/i);
  });
});

describe("custom columns on the production sheet", () => {
  const columns: schema.CustomColumn[] = [
    { key: "leg", label: { tr: "Ayak" }, type: "text", showOn: ["proforma", "production"] },
    { key: "target", label: { en: "Target price" }, type: "number", showOn: ["proforma"] },
  ];

  it("keeps only columns and values marked for production", () => {
    expect(productionCustomColumns(columns).map((column) => column.key)).toEqual(["leg"]);
    expect(pickProductionCustomValues(columns, { leg: "GOLD", target: 400, stale: "x" })).toEqual({
      leg: "GOLD",
    });
  });
});
