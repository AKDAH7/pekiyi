import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { fabrics, models, pieceTypes } from "./catalog";
import {
  businessColumns,
  currency,
  currencyCheck,
  DOC_LANGUAGES,
  inList,
  type DocLanguage,
} from "./common";
import { labelTemplates } from "./labels";

export const LABEL_BRANDINGS = ["pekiyi", "none", "customer_logo"] as const;
export type LabelBranding = (typeof LABEL_BRANDINGS)[number];

export const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DDP"] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull(),
    contactPerson: text("contact_person"),
    // ISO 3166-1 alpha-2.
    country: text("country").notNull(),
    city: text("city"),
    address: text("address"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    website: text("website"),
    // e.g. { "BTW": "NL 00373278B51", "KVK": "82812258" }
    taxIds: jsonb("tax_ids").$type<Record<string, string>>(),
    docLanguage: text("doc_language").$type<DocLanguage>().notNull().default("en"),
    defaultCurrency: currency("default_currency").notNull().default("USD"),
    secondaryCurrency: currency("secondary_currency"),
    defaultIncoterm: text("default_incoterm").$type<Incoterm>().notNull().default("EXW"),
    // Some customers forbid the PEKİYİ name on labels; overridable per order.
    labelBranding: text("label_branding").$type<LabelBranding>().notNull().default("pekiyi"),
    defaultLabelTemplateId: uuid("default_label_template_id").references(() => labelTemplates.id, {
      onDelete: "set null",
    }),
    logoPath: text("logo_path"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...businessColumns(),
  },
  (table) => [
    index("customers_company_name_idx").on(table.companyName),
    index("customers_default_label_template_idx").on(table.defaultLabelTemplateId),
    check("customers_country_check", sql`${table.country} ~ '^[A-Z]{2}$'`),
    check("customers_doc_language_check", inList(table.docLanguage, DOC_LANGUAGES)),
    check("customers_default_currency_check", currencyCheck(table.defaultCurrency)),
    check("customers_secondary_currency_check", currencyCheck(table.secondaryCurrency)),
    check("customers_incoterm_check", inList(table.defaultIncoterm, INCOTERMS)),
    check("customers_label_branding_check", inList(table.labelBranding, LABEL_BRANDINGS)),
  ],
);

/** A customer's own barcode / stock code / product name for one of our products. */
export const customerProductCodes = pgTable(
  "customer_product_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    // Null = applies to every piece type / every fabric of the model.
    pieceTypeId: uuid("piece_type_id").references(() => pieceTypes.id, { onDelete: "restrict" }),
    fabricId: uuid("fabric_id").references(() => fabrics.id, { onDelete: "restrict" }),
    // EAN-13; the checksum is validated in the app (isValidEan13).
    barcode: text("barcode").notNull(),
    stockCode: text("stock_code"),
    customerProductName: text("customer_product_name"),
    brandText: text("brand_text"),
    ...businessColumns(),
  },
  (table) => [
    unique("customer_product_codes_customer_barcode_unique").on(table.customerId, table.barcode),
    // One code per product variant; "every piece type / fabric" (null) counts as one variant.
    unique("customer_product_codes_customer_product_unique")
      .on(table.customerId, table.modelId, table.pieceTypeId, table.fabricId)
      .nullsNotDistinct(),
    index("customer_product_codes_model_idx").on(table.modelId),
    index("customer_product_codes_piece_type_idx").on(table.pieceTypeId),
    index("customer_product_codes_fabric_idx").on(table.fabricId),
    check("customer_product_codes_barcode_check", sql`${table.barcode} ~ '^[0-9]{13}$'`),
  ],
);
