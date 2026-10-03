-- Расходы закупщика привязываем к погрузочной накладной.
ALTER TABLE "purchaser_expenses" ADD COLUMN IF NOT EXISTS "loading_manifest_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchaser_expenses" ADD CONSTRAINT "purchaser_expenses_loading_manifest_id_fk" FOREIGN KEY ("loading_manifest_id") REFERENCES "public"."loading_manifests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchaser_expenses_loading_manifest_id_idx" ON "purchaser_expenses" USING btree ("loading_manifest_id");
--> statement-breakpoint
-- Отправка денег продавцом (кому, сумма, дата) — контроль в бухгалтерии.
CREATE TABLE IF NOT EXISTS "seller_money_sends" (
  "id" text PRIMARY KEY NOT NULL,
  "trip_id" text,
  "send_date" date NOT NULL,
  "amount_kopecks" bigint NOT NULL,
  "recipient" text NOT NULL,
  "comment" text,
  "recorded_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seller_money_sends" ADD CONSTRAINT "seller_money_sends_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seller_money_sends" ADD CONSTRAINT "seller_money_sends_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_money_sends_send_date_idx" ON "seller_money_sends" USING btree ("send_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_money_sends_trip_id_idx" ON "seller_money_sends" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_money_sends_recorded_by_user_id_idx" ON "seller_money_sends" USING btree ("recorded_by_user_id");
