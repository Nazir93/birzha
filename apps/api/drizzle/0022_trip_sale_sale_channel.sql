-- Розница / опт по строке продажи с рейса (агрегаты в отчёте).
ALTER TABLE "trip_batch_sales" ADD COLUMN IF NOT EXISTS "sale_channel" text DEFAULT 'retail' NOT NULL;
