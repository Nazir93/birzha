-- Товар рейса: отдельная нумерация 01, 02… внутри города по помидорам и по огурцам.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "product_group" text;

-- Существующие рейсы — помидоры (раньше товар не выбирали).
UPDATE "trips" SET "product_group" = 'Помидоры' WHERE "product_group" IS NULL;
