import { boolean, check, integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { businessColumns, DOC_LANGUAGES, inList, type DocLanguage, type LocalizedText } from "./common";

export const LABEL_KINDS = [
  "product", // product name + colour code + logo area
  "shipping", // sender / receiver / address + package contents
  "export", // English export label: logo, company, address, category, set type, colour
  "private_barcode", // customer's own EAN-13 + customer brand name
  "stock_barcode", // EAN-13, stock code, product name, colour, photo
] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

export const LABEL_LOGO_MODES = ["pekiyi", "customer", "none"] as const;
export type LabelLogoMode = (typeof LABEL_LOGO_MODES)[number];

export type LabelTemplateField = {
  /** Data field the renderer fills in (e.g. "productName", "colorCode", "barcode"). */
  field: string;
  label?: LocalizedText;
  size?: "sm" | "md" | "lg" | "xl";
};

/** Layout definitions only; rendering comes in Phase 8. */
export const labelTemplates = pgTable(
  "label_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    kind: text("kind").$type<LabelKind>().notNull(),
    // Null = printed in the order's document language.
    language: text("language").$type<DocLanguage>(),
    // Default A4 landscape; one label per page.
    pageWidthMm: numeric("page_width_mm", { precision: 6, scale: 1 }).notNull().default("297"),
    pageHeightMm: numeric("page_height_mm", { precision: 6, scale: 1 }).notNull().default("210"),
    logoMode: text("logo_mode").$type<LabelLogoMode>().notNull().default("pekiyi"),
    fields: jsonb("fields").$type<LabelTemplateField[]>().notNull().default([]),
    showQr: boolean("show_qr").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...businessColumns(),
  },
  (table) => [
    check("label_templates_kind_check", inList(table.kind, LABEL_KINDS)),
    check("label_templates_logo_mode_check", inList(table.logoMode, LABEL_LOGO_MODES)),
    check("label_templates_language_check", inList(table.language, DOC_LANGUAGES)),
  ],
);
