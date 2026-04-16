ALTER TABLE "trip_batch_sales" ADD COLUMN "price_per_kg_kopecks" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD COLUMN "revenue_kopecks" bigint DEFAULT 0 NOT NULL;
