-- Брутто на строках ЗН (нетто остаётся в quantity_grams).
ALTER TABLE "purchase_document_lines" ADD COLUMN IF NOT EXISTS "gross_quantity_grams" bigint;

UPDATE "purchase_document_lines"
SET "gross_quantity_grams" =
  "quantity_grams" + 500 * COALESCE("package_count", 0)
WHERE "gross_quantity_grams" IS NULL;
