ALTER TABLE trip_batch_sales ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now() NOT NULL;
