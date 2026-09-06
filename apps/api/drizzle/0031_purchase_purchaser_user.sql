-- Закупщик по накладной (сотрудник), отдельно от автора ввода (created_by_user_id).
ALTER TABLE "purchase_documents" ADD COLUMN IF NOT EXISTS "purchaser_user_id" text REFERENCES "users"("id") ON DELETE SET NULL;

-- Backfill: пока не выбрали явно — считаем закупщиком автора ввода.
UPDATE "purchase_documents"
SET "purchaser_user_id" = "created_by_user_id"
WHERE "purchaser_user_id" IS NULL AND "created_by_user_id" IS NOT NULL;
