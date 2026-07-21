-- DEFAULT true: старые и записи из отбора не попадают снова в ПН.
-- Возврат с рейса пишет blocks_loading=false в use case.
ALTER TABLE "batch_warehouse_write_offs" ADD COLUMN "blocks_loading" boolean DEFAULT true NOT NULL;
