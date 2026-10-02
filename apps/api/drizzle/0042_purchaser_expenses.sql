-- Расходы закупщиков (зарплата и прочее) — учёт бухгалтерии.
CREATE TABLE IF NOT EXISTS "purchaser_expenses" (
  "id" text PRIMARY KEY NOT NULL,
  "expense_date" date NOT NULL,
  "category" text NOT NULL,
  "amount_kopecks" bigint NOT NULL,
  "purchaser_user_id" text,
  "purchaser_label" text,
  "comment" text,
  "recorded_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchaser_expenses" ADD CONSTRAINT "purchaser_expenses_purchaser_user_id_fk" FOREIGN KEY ("purchaser_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchaser_expenses" ADD CONSTRAINT "purchaser_expenses_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchaser_expenses_expense_date_idx" ON "purchaser_expenses" USING btree ("expense_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchaser_expenses_purchaser_user_id_idx" ON "purchaser_expenses" USING btree ("purchaser_user_id");
