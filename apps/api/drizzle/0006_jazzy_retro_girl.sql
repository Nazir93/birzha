ALTER TABLE "trip_batch_sales" ADD COLUMN "cash_kopecks" bigint;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD COLUMN "debt_kopecks" bigint;--> statement-breakpoint
UPDATE "trip_batch_sales" SET "cash_kopecks" = "revenue_kopecks", "debt_kopecks" = 0 WHERE "cash_kopecks" IS NULL;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ALTER COLUMN "cash_kopecks" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ALTER COLUMN "debt_kopecks" SET NOT NULL;
