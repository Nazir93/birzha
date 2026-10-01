-- Оплаты тепличникам по закупочной накладной.
CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_document_id" text NOT NULL,
  "supplier_id" text,
  "amount_kopecks" bigint NOT NULL,
  "method" text NOT NULL,
  "paid_at" date NOT NULL,
  "comment" text,
  "recorded_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_document_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payments_document_id_idx" ON "supplier_payments" USING btree ("purchase_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payments_paid_at_idx" ON "supplier_payments" USING btree ("paid_at");
