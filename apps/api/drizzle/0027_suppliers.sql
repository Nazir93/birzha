CREATE TABLE "suppliers" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "suppliers_is_active_idx" ON "suppliers" ("is_active");

ALTER TABLE "purchase_documents" ADD COLUMN "supplier_id" text REFERENCES "suppliers"("id") ON DELETE SET NULL;
