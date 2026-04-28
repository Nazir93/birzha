-- Автор накладной (закупщик); назначенный продавец на рейсе — фильтр списка для полевого продавца.
ALTER TABLE "purchase_documents" ADD COLUMN IF NOT EXISTS "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "assigned_seller_user_id" text REFERENCES "users"("id") ON DELETE SET NULL;
