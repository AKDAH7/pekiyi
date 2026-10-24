import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_ORDER_NUMBER_PATTERN, DEFAULT_REVISION_SUFFIX } from "../../lib/domain/order-number";

import { businessColumns, currency, currencyCheck, rate, type LocalizedText } from "./common";

/** Exactly one row (id = 1), edited from the admin settings page. */
export const companySettings = pgTable(
  "company_settings",
  {
    id: integer("id").primaryKey().default(1),
    legalName: text("legal_name").notNull(),
    brandName: text("brand_name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    hsCode: text("hs_code"),
    logoPath: text("logo_path"),
    orderNumberPattern: text("order_number_pattern")
      .notNull()
      .default(DEFAULT_ORDER_NUMBER_PATTERN),
    revisionSuffix: text("revision_suffix").notNull().default(DEFAULT_REVISION_SUFFIX),
    // Internal company code put into new order numbers ("ZOC"). Each order
    // stores the code it was created with (orders.order_code), so changing
    // this never renumbers existing orders.
    orderCode: text("order_code").notNull().default("ZOC"),
    defaultDeliveryTime: jsonb("default_delivery_time").$type<LocalizedText>(),
    defaultPaymentTerms: jsonb("default_payment_terms").$type<LocalizedText>(),
    ...businessColumns(),
  },
  (table) => [check("company_settings_single_row", sql`${table.id} = 1`)],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankName: text("bank_name").notNull(),
    swift: text("swift"),
    branch: text("branch"),
    beneficiary: text("beneficiary").notNull(),
    currency: currency("currency").notNull(),
    iban: text("iban").notNull().unique(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...businessColumns(),
  },
  (table) => [
    check("bank_accounts_currency_check", currencyCheck(table.currency)),
    index("bank_accounts_currency_idx").on(table.currency),
    // One active account per currency: documents print "the" EUR IBAN.
    uniqueIndex("bank_accounts_active_currency_unique")
      .on(table.currency)
      .where(sql`${table.active}`),
  ],
);

/** Rates are typed in by users each day; `rate` = units of `to` per 1 `from`. */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date", { mode: "string" }).notNull(),
    fromCurrency: currency("from_currency").notNull(),
    toCurrency: currency("to_currency").notNull(),
    rate: rate("rate").notNull(),
    ...businessColumns(),
  },
  (table) => [
    unique("exchange_rates_date_pair_unique").on(table.date, table.fromCurrency, table.toCurrency),
    check("exchange_rates_from_check", currencyCheck(table.fromCurrency)),
    check("exchange_rates_to_check", currencyCheck(table.toCurrency)),
    check("exchange_rates_positive", sql`${table.rate} > 0`),
  ],
);
