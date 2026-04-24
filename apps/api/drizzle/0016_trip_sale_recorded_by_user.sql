-- Кто внёс строку продажи (для отчёта «только свои» у полевого продавца).
ALTER TABLE "trip_batch_sales" ADD COLUMN "recorded_by_user_id" text;
ALTER TABLE "trip_batch_sales" ADD CONSTRAINT "trip_batch_sales_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
