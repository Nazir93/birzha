-- Ящики по строке продажи с рейса (опционально в БД; обязательны в UI при учёте ящиков в отгрузке).
ALTER TABLE "trip_batch_sales" ADD COLUMN IF NOT EXISTS "package_count" bigint;
