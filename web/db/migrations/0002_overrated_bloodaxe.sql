CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"swift" text,
	"branch" text,
	"beneficiary" text NOT NULL,
	"currency" text NOT NULL,
	"iban" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bank_accounts_iban_unique" UNIQUE("iban"),
	CONSTRAINT "bank_accounts_currency_check" CHECK ("bank_accounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"brand_name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"hs_code" text,
	"logo_path" text,
	"order_number_pattern" text DEFAULT '{YY}{MM}{DD}-{SEQ}{CODE}' NOT NULL,
	"revision_suffix" text DEFAULT '-REV{N}' NOT NULL,
	"order_code" text DEFAULT 'ZOC' NOT NULL,
	"default_delivery_time" jsonb,
	"default_payment_terms" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate" numeric(14, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "exchange_rates_date_pair_unique" UNIQUE("date","from_currency","to_currency"),
	CONSTRAINT "exchange_rates_from_check" CHECK ("exchange_rates"."from_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "exchange_rates_to_check" CHECK ("exchange_rates"."to_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "fabrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"code" text NOT NULL,
	"color_key" text,
	"color_name" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fabrics_brand_code_unique" UNIQUE("brand","code")
);
--> statement-breakpoint
CREATE TABLE "model_piece_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"piece_type_id" uuid NOT NULL,
	"base_price" numeric(12, 2),
	"base_currency" text DEFAULT 'TRY' NOT NULL,
	"unit_cbm" numeric(8, 3),
	"unit_weight_kg" numeric(8, 2),
	"package_count" integer DEFAULT 1 NOT NULL,
	"package_contents" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "model_piece_prices_model_piece_unique" UNIQUE("model_id","piece_type_id"),
	CONSTRAINT "model_piece_prices_currency_check" CHECK ("model_piece_prices"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "model_piece_prices_package_count_check" CHECK ("model_piece_prices"."package_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "model_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"composition" text NOT NULL,
	"fixed_price" numeric(12, 2),
	"currency" text DEFAULT 'TRY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "model_presets_model_composition_unique" UNIQUE("model_id","composition"),
	CONSTRAINT "model_presets_currency_check" CHECK ("model_presets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"is_sofabed" boolean DEFAULT false NOT NULL,
	"main_photo_path" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "models_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "piece_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"seats" integer DEFAULT 0 NOT NULL,
	"is_accessory" boolean DEFAULT false NOT NULL,
	"name" jsonb NOT NULL,
	"short_name" jsonb,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "piece_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "label_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"kind" text NOT NULL,
	"language" text,
	"page_width_mm" numeric(6, 1) DEFAULT '297' NOT NULL,
	"page_height_mm" numeric(6, 1) DEFAULT '210' NOT NULL,
	"logo_mode" text DEFAULT 'pekiyi' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"show_qr" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "label_templates_code_unique" UNIQUE("code"),
	CONSTRAINT "label_templates_kind_check" CHECK ("label_templates"."kind" in ('product', 'shipping', 'export', 'private_barcode', 'stock_barcode')),
	CONSTRAINT "label_templates_logo_mode_check" CHECK ("label_templates"."logo_mode" in ('pekiyi', 'customer', 'none')),
	CONSTRAINT "label_templates_language_check" CHECK ("label_templates"."language" in ('tr', 'en', 'ar'))
);
--> statement-breakpoint
CREATE TABLE "customer_product_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"piece_type_id" uuid,
	"fabric_id" uuid,
	"barcode" text NOT NULL,
	"stock_code" text,
	"customer_product_name" text,
	"brand_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "customer_product_codes_customer_barcode_unique" UNIQUE("customer_id","barcode"),
	CONSTRAINT "customer_product_codes_barcode_check" CHECK ("customer_product_codes"."barcode" ~ '^[0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_person" text,
	"country" text NOT NULL,
	"city" text,
	"address" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"website" text,
	"tax_ids" jsonb,
	"doc_language" text DEFAULT 'en' NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"secondary_currency" text,
	"default_incoterm" text DEFAULT 'EXW' NOT NULL,
	"label_branding" text DEFAULT 'pekiyi' NOT NULL,
	"default_label_template_id" uuid,
	"logo_path" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "customers_country_check" CHECK ("customers"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "customers_doc_language_check" CHECK ("customers"."doc_language" in ('tr', 'en', 'ar')),
	CONSTRAINT "customers_default_currency_check" CHECK ("customers"."default_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "customers_secondary_currency_check" CHECK ("customers"."secondary_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "customers_incoterm_check" CHECK ("customers"."default_incoterm" in ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP')),
	CONSTRAINT "customers_label_branding_check" CHECK ("customers"."label_branding" in ('pekiyi', 'none', 'customer_logo'))
);
--> statement-breakpoint
CREATE TABLE "document_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"number" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"language" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"pdf_path" text,
	"xlsx_path" text,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_issues_doc_type_check" CHECK ("document_issues"."doc_type" in ('price_offer', 'proforma', 'production', 'loading', 'label')),
	CONSTRAINT "document_issues_language_check" CHECK ("document_issues"."language" in ('tr', 'en', 'ar'))
);
--> statement-breakpoint
CREATE TABLE "order_item_fabrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"fabric_id" uuid,
	"free_text" text,
	"role" text DEFAULT 'main' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_item_fabrics_source_check" CHECK ("order_item_fabrics"."fabric_id" is not null or "order_item_fabrics"."free_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_item_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"piece_type_id" uuid NOT NULL,
	"qty_per_unit" integer NOT NULL,
	"model_override_id" uuid,
	"unit_price" numeric(12, 2),
	"fabric_override_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_item_pieces_qty_check" CHECK ("order_item_pieces"."qty_per_unit" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"model_id" uuid NOT NULL,
	"display_name" jsonb,
	"composition" text,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'SET' NOT NULL,
	"unit_price" numeric(12, 2),
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"unit_cbm" numeric(8, 3),
	"photo_path" text,
	"customer_note" jsonb,
	"production_note" jsonb,
	"custom_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_items_unit_check" CHECK ("order_items"."unit" in ('SET', 'PCS')),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_discount_check" CHECK ("order_items"."discount_percent" >= 0 and "order_items"."discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "order_reference_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb,
	"photo_path" text,
	"show_on" text[] DEFAULT '{proforma,production}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"base_number" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"order_code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'offer' NOT NULL,
	"order_date" date NOT NULL,
	"currency" text NOT NULL,
	"secondary_currency" text,
	"secondary_rate" numeric(14, 6),
	"incoterm" text DEFAULT 'EXW' NOT NULL,
	"delivery_time" jsonb,
	"payment_terms" jsonb,
	"advance_type" text,
	"advance_value" numeric(12, 2),
	"customer_notes" jsonb,
	"production_notes" jsonb,
	"sample_approval_required" boolean DEFAULT false NOT NULL,
	"sample_approval_text" jsonb,
	"document_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label_branding" text,
	"label_template_id" uuid,
	"custom_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_base_number_revision_unique" UNIQUE("base_number","revision"),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('offer', 'proforma', 'confirmed', 'in_production', 'ready', 'loading', 'shipped', 'closed', 'cancelled')),
	CONSTRAINT "orders_currency_check" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_secondary_currency_check" CHECK ("orders"."secondary_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_incoterm_check" CHECK ("orders"."incoterm" in ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP')),
	CONSTRAINT "orders_advance_type_check" CHECK ("orders"."advance_type" in ('amount', 'percent')),
	CONSTRAINT "orders_label_branding_check" CHECK ("orders"."label_branding" in ('pekiyi', 'none', 'customer_logo')),
	CONSTRAINT "orders_revision_check" CHECK ("orders"."revision" >= 0),
	CONSTRAINT "orders_secondary_pair_check" CHECK (("orders"."secondary_currency" is null) = ("orders"."secondary_rate" is null)),
	CONSTRAINT "orders_advance_pair_check" CHECK (("orders"."advance_type" is null) = ("orders"."advance_value" is null))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_type_check" CHECK ("payments"."type" in ('advance', 'balance', 'other'))
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabrics" ADD CONSTRAINT "fabrics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_piece_prices" ADD CONSTRAINT "model_piece_prices_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_piece_prices" ADD CONSTRAINT "model_piece_prices_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_piece_prices" ADD CONSTRAINT "model_piece_prices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_presets" ADD CONSTRAINT "model_presets_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_presets" ADD CONSTRAINT "model_presets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_types" ADD CONSTRAINT "piece_types_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_codes" ADD CONSTRAINT "customer_product_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_codes" ADD CONSTRAINT "customer_product_codes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_codes" ADD CONSTRAINT "customer_product_codes_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_codes" ADD CONSTRAINT "customer_product_codes_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_codes" ADD CONSTRAINT "customer_product_codes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_default_label_template_id_label_templates_id_fk" FOREIGN KEY ("default_label_template_id") REFERENCES "public"."label_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_issues" ADD CONSTRAINT "document_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_issues" ADD CONSTRAINT "document_issues_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_fabrics" ADD CONSTRAINT "order_item_fabrics_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_fabrics" ADD CONSTRAINT "order_item_fabrics_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_fabrics" ADD CONSTRAINT "order_item_fabrics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_pieces" ADD CONSTRAINT "order_item_pieces_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_pieces" ADD CONSTRAINT "order_item_pieces_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_pieces" ADD CONSTRAINT "order_item_pieces_model_override_id_models_id_fk" FOREIGN KEY ("model_override_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_pieces" ADD CONSTRAINT "order_item_pieces_fabric_override_id_fabrics_id_fk" FOREIGN KEY ("fabric_override_id") REFERENCES "public"."fabrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_pieces" ADD CONSTRAINT "order_item_pieces_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reference_notes" ADD CONSTRAINT "order_reference_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reference_notes" ADD CONSTRAINT "order_reference_notes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_label_template_id_label_templates_id_fk" FOREIGN KEY ("label_template_id") REFERENCES "public"."label_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_currency_idx" ON "bank_accounts" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "model_piece_prices_piece_type_idx" ON "model_piece_prices" USING btree ("piece_type_id");--> statement-breakpoint
CREATE INDEX "customer_product_codes_model_idx" ON "customer_product_codes" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "customer_product_codes_piece_type_idx" ON "customer_product_codes" USING btree ("piece_type_id");--> statement-breakpoint
CREATE INDEX "customer_product_codes_fabric_idx" ON "customer_product_codes" USING btree ("fabric_id");--> statement-breakpoint
CREATE INDEX "customers_company_name_idx" ON "customers" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "customers_default_label_template_idx" ON "customers" USING btree ("default_label_template_id");--> statement-breakpoint
CREATE INDEX "document_issues_order_idx" ON "document_issues" USING btree ("order_id","doc_type");--> statement-breakpoint
CREATE INDEX "document_issues_issued_by_idx" ON "document_issues" USING btree ("issued_by");--> statement-breakpoint
CREATE INDEX "order_item_fabrics_item_id_idx" ON "order_item_fabrics" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "order_item_fabrics_fabric_id_idx" ON "order_item_fabrics" USING btree ("fabric_id");--> statement-breakpoint
CREATE INDEX "order_item_pieces_item_id_idx" ON "order_item_pieces" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "order_item_pieces_piece_type_idx" ON "order_item_pieces" USING btree ("piece_type_id");--> statement-breakpoint
CREATE INDEX "order_item_pieces_model_override_idx" ON "order_item_pieces" USING btree ("model_override_id");--> statement-breakpoint
CREATE INDEX "order_item_pieces_fabric_override_idx" ON "order_item_pieces" USING btree ("fabric_override_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "order_items_model_id_idx" ON "order_items" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "order_reference_notes_order_id_idx" ON "order_reference_notes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_order_date_idx" ON "orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "orders_label_template_idx" ON "orders" USING btree ("label_template_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");