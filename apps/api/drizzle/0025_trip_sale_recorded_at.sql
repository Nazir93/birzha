ALTER TABLE "trip_batch_sales" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;
