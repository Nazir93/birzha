-- Оплаты долгов клиентов по сделке (sale_id из trip_batch_sales). Проводит бухгалтерия.
CREATE TABLE IF NOT EXISTS "debt_payments" (
  "id" text PRIMARY KEY NOT NULL,
  "sale_id" text NOT NULL,
  "trip_id" text NOT NULL,
  "counterparty_id" text,
  "client_label" text,
  "amount_kopecks" bigint NOT NULL,
  "method" text NOT NULL,
  "paid_at" date NOT NULL,
  "comment" text,
  "recorded_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_sale_id_idx" ON "debt_payments" USING btree ("sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_trip_id_idx" ON "debt_payments" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_paid_at_idx" ON "debt_payments" USING btree ("paid_at");
