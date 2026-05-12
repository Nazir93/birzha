-- =============================================================================
-- ВНИМАНИЕ: необратимо удаляет все учётные движения и документы закупки.
-- Сохраняются: users, user_roles, roles, warehouses, product_grades,
-- ship_destinations (справочники).
--
-- Перед запуском на продакшене:
--   pg_dump "$DATABASE_URL" --format=custom --file "birzha-before-wipe-$(date +%F-%H%M).dump"
--
-- Запуск (из каталога с доступом к .env):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/scripts/wipe-business-data.sql
-- =============================================================================

BEGIN;

TRUNCATE TABLE
  trip_batch_sales,
  trip_batch_shortages,
  trip_batch_shipments,
  loading_manifest_lines,
  loading_manifests,
  trips,
  batch_warehouse_write_offs,
  purchase_document_lines,
  batches,
  purchase_documents,
  counterparties,
  sync_processed_actions
RESTART IDENTITY CASCADE;

COMMIT;
