import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { fabrics, models, pieceTypes } from "./catalog";
import {
  businessColumns,
  cbm,
  currency,
  currencyCheck,
  DOC_LANGUAGES,
  inList,
  money,
  rate,
  type DocLanguage,
  type LocalizedText,
} from "./common";
import { customers, INCOTERMS, LABEL_BRANDINGS, type Incoterm, type LabelBranding } from "./customers";
import { labelTemplates } from "./labels";

export const ORDER_STATUSES = [
  "offer",
  "proforma",
  "confirmed",
  "in_production",
  "ready",
  "loading",
  "shipped",
  "closed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ADVANCE_TYPES = ["amount", "percent"] as const;
export type AdvanceType = (typeof ADVANCE_TYPES)[number];

export const ORDER_UNITS = ["SET", "PCS"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];

export const DOCUMENT_TARGETS = ["proforma", "production", "loading"] as const;
export type DocumentTarget = (typeof DOCUMENT_TARGETS)[number];

export type DocumentOptions = {
  showPiecePrices?: boolean;
  showSecondaryCurrency?: boolean;
  showCbm?: boolean;
  showPhotos?: boolean;
};

/** A user-defined extra column on the order grid / documents. */
export type CustomColumn = {
  key: string;
  label: LocalizedText;
  type: "text" | "number";
  showOn: DocumentTarget[];
};

export type CustomValues = Record<string, string | number | null>;

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Current full number, e.g. "261022-1ZOC-REV11".
    number: text("number").notNull().unique(),
    // Number without the revision suffix, e.g. "261022-1ZOC".
    baseNumber: text("base_number").notNull(),
    revision: integer("revision").notNull().default(0),
    // Company code used when this order was numbered; revisions keep it.
    orderCode: text("order_code").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").$type<OrderStatus>().notNull().default("offer"),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    currency: currency("currency").notNull(),
    secondaryCurrency: currency("secondary_currency"),
    // Units of `currency` per 1 unit of `secondary_currency` (USD per EUR = 1.12).
    secondaryRate: rate("secondary_rate"),
    incoterm: text("incoterm").$type<Incoterm>().notNull().default("EXW"),
    deliveryTime: jsonb("delivery_time").$type<LocalizedText>(),
    paymentTerms: jsonb("payment_terms").$type<LocalizedText>(),
    advanceType: text("advance_type").$type<AdvanceType>(),
    // An amount in `currency`, or a percentage (30 = 30 %), per advance_type.
    advanceValue: numeric("advance_value", { precision: 12, scale: 2 }),
    // Printed on the proforma.
    customerNotes: jsonb("customer_notes").$type<LocalizedText>(),
    // Printed on the production sheet.
    productionNotes: jsonb("production_notes").$type<LocalizedText>(),
    sampleApprovalRequired: boolean("sample_approval_required").notNull().default(false),
    sampleApprovalText: jsonb("sample_approval_text").$type<LocalizedText>(),
    documentOptions: jsonb("document_options").$type<DocumentOptions>().notNull().default({}),
    // Null = use the customer's setting.
    labelBranding: text("label_branding").$type<LabelBranding>(),
    labelTemplateId: uuid("label_template_id").references(() => labelTemplates.id, {
      onDelete: "set null",
    }),
    customColumns: jsonb("custom_columns").$type<CustomColumn[]>().notNull().default([]),
    ...businessColumns(),
  },
  (table) => [
    unique("orders_base_number_revision_unique").on(table.baseNumber, table.revision),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_status_idx").on(table.status),
    index("orders_order_date_idx").on(table.orderDate),
    index("orders_label_template_idx").on(table.labelTemplateId),
    check("orders_status_check", inList(table.status, ORDER_STATUSES)),
    check("orders_currency_check", currencyCheck(table.currency)),
    check("orders_secondary_currency_check", currencyCheck(table.secondaryCurrency)),
    check("orders_incoterm_check", inList(table.incoterm, INCOTERMS)),
    check("orders_advance_type_check", inList(table.advanceType, ADVANCE_TYPES)),
    check("orders_label_branding_check", inList(table.labelBranding, LABEL_BRANDINGS)),
    check("orders_revision_check", sql`${table.revision} >= 0`),
    check(
      "orders_secondary_pair_check",
      sql`(${table.secondaryCurrency} is null) = (${table.secondaryRate} is null)`,
    ),
    check(
      "orders_advance_pair_check",
      sql`(${table.advanceType} is null) = (${table.advanceValue} is null)`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    displayName: jsonb("display_name").$type<LocalizedText>(),
    // "3+3+1+1"; the pieces below are generated from it but editable.
    composition: text("composition"),
    quantity: integer("quantity").notNull(),
    unit: text("unit").$type<OrderUnit>().notNull().default("SET"),
    // Negotiated price per unit, in the order currency. Never sent to production.
    unitPrice: money("unit_price"),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    // Null = derived from the catalog piece CBMs.
    unitCbm: cbm("unit_cbm"),
    photoPath: text("photo_path"),
    customerNote: jsonb("customer_note").$type<LocalizedText>(),
    productionNote: jsonb("production_note").$type<LocalizedText>(),
    customValues: jsonb("custom_values").$type<CustomValues>().notNull().default({}),
    ...businessColumns(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId, table.position),
    index("order_items_model_id_idx").on(table.modelId),
    check("order_items_unit_check", inList(table.unit, ORDER_UNITS)),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check(
      "order_items_discount_check",
      sql`${table.discountPercent} >= 0 and ${table.discountPercent} <= 100`,
    ),
  ],
);

/** The pieces one unit (set) of an item consists of. */
export const orderItemPieces = pgTable(
  "order_item_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    pieceTypeId: uuid("piece_type_id")
      .notNull()
      .references(() => pieceTypes.id, { onDelete: "restrict" }),
    qtyPerUnit: integer("qty_per_unit").notNull(),
    // e.g. the armchair of a VERA set is a DAMLA armchair.
    modelOverrideId: uuid("model_override_id").references(() => models.id, {
      onDelete: "restrict",
    }),
    // Only used with per-piece pricing (documentOptions.showPiecePrices).
    unitPrice: money("unit_price"),
    fabricOverrideId: uuid("fabric_override_id").references(() => fabrics.id, {
      onDelete: "restrict",
    }),
    ...businessColumns(),
  },
  (table) => [
    index("order_item_pieces_item_id_idx").on(table.itemId),
    index("order_item_pieces_piece_type_idx").on(table.pieceTypeId),
    index("order_item_pieces_model_override_idx").on(table.modelOverrideId),
    index("order_item_pieces_fabric_override_idx").on(table.fabricOverrideId),
    check("order_item_pieces_qty_check", sql`${table.qtyPerUnit} > 0`),
  ],
);

export const orderItemFabrics = pgTable(
  "order_item_fabrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    // A catalog fabric, or free text for one that isn't in the catalog yet.
    fabricId: uuid("fabric_id").references(() => fabrics.id, { onDelete: "restrict" }),
    freeText: text("free_text"),
    // "main" | "secondary" | "piping" | ... — open-ended on purpose.
    role: text("role").notNull().default("main"),
    position: integer("position").notNull().default(0),
    ...businessColumns(),
  },
  (table) => [
    index("order_item_fabrics_item_id_idx").on(table.itemId),
    index("order_item_fabrics_fabric_id_idx").on(table.fabricId),
    check(
      "order_item_fabrics_source_check",
      sql`${table.fabricId} is not null or ${table.freeText} is not null`,
    ),
  ],
);

/** "GOLD model legs" + a photo, shown on the documents listed in show_on. */
export const orderReferenceNotes = pgTable(
  "order_reference_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    body: jsonb("body").$type<LocalizedText>(),
    photoPath: text("photo_path"),
    showOn: text("show_on")
      .array()
      .$type<DocumentTarget[]>()
      .notNull()
      .default(sql`'{proforma,production}'::text[]`),
    ...businessColumns(),
  },
  (table) => [index("order_reference_notes_order_id_idx").on(table.orderId)],
);

export const PAYMENT_TYPES = ["advance", "balance", "other"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Restrict: money records must not disappear with an order.
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    amount: money("amount").notNull(),
    currency: currency("currency").notNull(),
    type: text("type").$type<PaymentType>().notNull(),
    note: text("note"),
    ...businessColumns(),
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    check("payments_currency_check", currencyCheck(table.currency)),
    check("payments_type_check", inList(table.type, PAYMENT_TYPES)),
  ],
);

export const DOC_TYPES = ["price_offer", "proforma", "production", "loading", "label"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * An issued document. `snapshot` is a frozen copy of every value the document
 * was built from, so it can be re-rendered identically later; editing the
 * order afterwards leads to a new revision, never to a changed issue. Issues
 * are immutable, hence no updated_at/version.
 */
export const documentIssues = pgTable(
  "document_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    docType: text("doc_type").$type<DocType>().notNull(),
    number: text("number").notNull(),
    revision: integer("revision").notNull().default(0),
    language: text("language").$type<DocLanguage>().notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    pdfPath: text("pdf_path"),
    xlsxPath: text("xlsx_path"),
    issuedBy: text("issued_by").references(() => user.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_issues_order_idx").on(table.orderId, table.docType),
    index("document_issues_issued_by_idx").on(table.issuedBy),
    check("document_issues_doc_type_check", inList(table.docType, DOC_TYPES)),
    check("document_issues_language_check", inList(table.language, DOC_LANGUAGES)),
  ],
);
