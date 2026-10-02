-- Полевые траты продавца с кассы (грузчик, обед, палеты, аренда и т.п.).
CREATE TABLE IF NOT EXISTS "seller_field_expenses" (
  "id" text PRIMARY KEY NOT NULL,
  "trip_id" text NOT NULL,
  "expense_date" date NOT NULL,
  "category" text NOT NULL,
  "amount_kopecks" bigint NOT NULL,
  "comment" text,
  "recorded_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seller_field_expenses" ADD CONSTRAINT "seller_field_expenses_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seller_field_expenses" ADD CONSTRAINT "seller_field_expenses_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_field_expenses_trip_id_idx" ON "seller_field_expenses" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_field_expenses_expense_date_idx" ON "seller_field_expenses" USING btree ("expense_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_field_expenses_user_date_idx" ON "seller_field_expenses" USING btree ("recorded_by_user_id", "expense_date");
