-- Журнал списаний с остатка на складе (в т.ч. «брак, кг») для сходимости с бух. по накладной/партии.
CREATE TABLE IF NOT EXISTS "batch_warehouse_write_offs" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL,
  "grams" bigint NOT NULL,
  "reason" text NOT NULL DEFAULT 'quality_reject',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "batch_warehouse_write_offs_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "batch_warehouse_write_offs_batch_id_idx" ON "batch_warehouse_write_offs" ("batch_id");
CREATE INDEX IF NOT EXISTS "batch_warehouse_write_offs_batch_reason_idx" ON "batch_warehouse_write_offs" ("batch_id", "reason");
