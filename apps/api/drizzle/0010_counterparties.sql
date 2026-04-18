CREATE TABLE "counterparties" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD COLUMN "counterparty_id" text;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD CONSTRAINT "trip_batch_sales_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;