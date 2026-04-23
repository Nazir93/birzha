ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "vehicle_label" text;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "departed_at" timestamptz;
