import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  businessColumns,
  cbm,
  currency,
  currencyCheck,
  money,
  type LocalizedText,
} from "./common";

/** SEAT_3, SEAT_2, SEAT_1, CUSHION_EXTRA, ... — the building blocks of a set. */
export const pieceTypes = pgTable("piece_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  // Digit used in compositions ("3+3+1+1"); 0 for accessories.
  seats: integer("seats").notNull().default(0),
  isAccessory: boolean("is_accessory").notNull().default(false),
  name: jsonb("name").$type<LocalizedText>().notNull(),
  shortName: jsonb("short_name").$type<LocalizedText>(),
  sort: integer("sort").notNull().default(0),
  ...businessColumns(),
});

export const models = pgTable("models", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: jsonb("name").$type<LocalizedText>().notNull(),
  description: jsonb("description").$type<LocalizedText>(),
  isSofabed: boolean("is_sofabed").notNull().default(false),
  mainPhotoPath: text("main_photo_path"),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  ...businessColumns(),
});

/** Catalog price and packing data of one piece of one model. */
export const modelPiecePrices = pgTable(
  "model_piece_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    pieceTypeId: uuid("piece_type_id")
      .notNull()
      .references(() => pieceTypes.id, { onDelete: "restrict" }),
    // Null = not priced yet (some models only have a fixed set price).
    basePrice: money("base_price"),
    baseCurrency: currency("base_currency").notNull().default("TRY"),
    unitCbm: cbm("unit_cbm"),
    unitWeightKg: numeric("unit_weight_kg", { precision: 8, scale: 2 }),
    // How many packages (and so labels) one piece ships in.
    packageCount: integer("package_count").notNull().default(1),
    // What is inside the packages, printed on shipping labels ("2 ADET AYAK").
    packageContents: jsonb("package_contents").$type<LocalizedText>(),
    ...businessColumns(),
  },
  (table) => [
    unique("model_piece_prices_model_piece_unique").on(table.modelId, table.pieceTypeId),
    index("model_piece_prices_piece_type_idx").on(table.pieceTypeId),
    check("model_piece_prices_currency_check", currencyCheck(table.baseCurrency)),
    check("model_piece_prices_package_count_check", sql`${table.packageCount} >= 0`),
  ],
);

/** Standard compositions a model is sold in, optionally with a fixed set price. */
export const modelPresets = pgTable(
  "model_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    composition: text("composition").notNull(),
    // Null = price is the sum of the piece prices.
    fixedPrice: money("fixed_price"),
    currency: currency("currency").notNull().default("TRY"),
    ...businessColumns(),
  },
  (table) => [
    unique("model_presets_model_composition_unique").on(table.modelId, table.composition),
    check("model_presets_currency_check", currencyCheck(table.currency)),
  ],
);

export const fabrics = pgTable(
  "fabrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: text("brand").notNull(),
    code: text("code").notNull(),
    // The supplier's colour word as written on our sheets ("A.GRİ").
    colorKey: text("color_key"),
    colorName: jsonb("color_name").$type<LocalizedText>(),
    active: boolean("active").notNull().default(true),
    ...businessColumns(),
  },
  (table) => [unique("fabrics_brand_code_unique").on(table.brand, table.code)],
);
