CREATE TABLE "column_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "column_templates_scope_name_unique" UNIQUE NULLS NOT DISTINCT("customer_id","name"),
	CONSTRAINT "column_templates_default_check" CHECK (not "column_templates"."is_default" or "column_templates"."customer_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "document_issues" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "column_templates" ADD CONSTRAINT "column_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_templates" ADD CONSTRAINT "column_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "column_templates_customer_idx" ON "column_templates" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "column_templates_default_unique" ON "column_templates" USING btree ("customer_id") WHERE "column_templates"."is_default";