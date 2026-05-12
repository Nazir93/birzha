CREATE TABLE "wholesalers" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "wholesalers_is_active_idx" ON "wholesalers" ("is_active");

ALTER TABLE "trip_batch_sales" ADD COLUMN "wholesale_buyer_id" text REFERENCES "wholesalers"("id") ON DELETE SET NULL;
