-- После db:push колонки gross_quantity_grams (брутто на строках ЗН).
-- Старые строки: брутто = нетто + 500 г × ящики (тара 0,5 кг / ящ.).
-- Перед применением на проде — свежий pg_dump (см. docs/deployment/runbook.md).

ALTER TABLE purchase_document_lines
  ADD COLUMN IF NOT EXISTS gross_quantity_grams bigint;

UPDATE purchase_document_lines
SET gross_quantity_grams =
  quantity_grams + 500 * COALESCE(package_count, 0)
WHERE gross_quantity_grams IS NULL;
