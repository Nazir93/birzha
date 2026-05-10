-- Перевод на карту (отдельно от наличных и долга); сумма по строке + остаток выручки = наличные.
ALTER TABLE "trip_batch_sales" ADD COLUMN IF NOT EXISTS "card_transfer_kopecks" bigint DEFAULT 0 NOT NULL;
