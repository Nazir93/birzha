-- Город рейса (нумерация 01, 02… в рамках направления).
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "destination_code" text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_destination_code_ship_destinations_code_fk'
  ) THEN
    ALTER TABLE "trips"
      ADD CONSTRAINT "trips_destination_code_ship_destinations_code_fk"
      FOREIGN KEY ("destination_code") REFERENCES "ship_destinations"("code");
  END IF;
END $$;
