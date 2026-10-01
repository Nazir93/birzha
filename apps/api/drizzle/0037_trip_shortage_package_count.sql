-- Ящики по строке недостачи по рейсу (опционально; масса по-прежнему в grams).
ALTER TABLE "trip_batch_shortages" ADD COLUMN IF NOT EXISTS "package_count" bigint;
