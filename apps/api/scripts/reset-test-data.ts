/**
 * Очистка **данных** PostgreSQL для тестового стенда: схема не трогается.
 *
 * - Удаляет: рейсы, отгрузки/продажи/недостачи по рейсу, погрузочные накладные, закупочные накладные и партии,
 *   списания с склада, контрагентов, оптовиков, офлайн-журнал `sync_processed_actions`, **склады и калибры** (как в демо).
 * - Не трогает: `users`, `user_roles`, `roles`, `ship_destinations` (направления отгрузки).
 * - Снова вставляет **склады и калибры** как в сиде ниже (Манас/Каякент, №5…).
 *
 *   cd apps/api
 *   pnpm db:reset-test-data
 *
 * Нужен `DATABASE_URL` в `apps/api/.env`. Перед продакшеном — `pg_dump`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { createDb } from "../src/db/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}

const { sql } = createDb(process.env.DATABASE_URL);

const TRUNCATE = `
  TRUNCATE
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
    wholesalers,
    sync_processed_actions,
    warehouses,
    product_grades
  RESTART IDENTITY CASCADE
`;

const SEED_WAREHOUSES = `
  INSERT INTO warehouses (id, code, name) VALUES
    ('wh-manas', 'MANAS', 'Манас'),
    ('wh-kayakent', 'KAYAKENT', 'Каякент')
`;

const SEED_SHIP_DESTINATIONS = `
  INSERT INTO ship_destinations (code, display_name, sort_order, is_active) VALUES
    ('moscow', 'Москва', 10, true),
    ('regions', 'Регионы', 20, true),
    ('discount', 'Уценка / распродажа', 30, true),
    ('writeoff', 'Списание', 40, true)
  ON CONFLICT (code) DO NOTHING
`;

const SEED_GRADES = `
  INSERT INTO product_grades (id, code, display_name, sort_order, is_active, product_group) VALUES
    ('pg-n5', '№5', 'Калибр №5', 5, true, 'Помидоры'),
    ('pg-n6', '№6', 'Калибр №6', 6, true, 'Помидоры'),
    ('pg-n7', '№7', 'Калибр №7', 7, true, 'Помидоры'),
    ('pg-n8', '№8', 'Калибр №8', 8, true, 'Помидоры'),
    ('pg-nsm', 'НС-', 'НС-', 20, true, 'Помидоры'),
    ('pg-nsp', 'НС+', 'НС+', 21, true, 'Помидоры'),
    ('pg-om', 'Ом.', 'Ом.', 30, true, 'Помидоры')
`;

try {
  await sql.begin(async (q) => {
    await q.unsafe(TRUNCATE);
    await q.unsafe(SEED_WAREHOUSES);
    await q.unsafe(SEED_SHIP_DESTINATIONS);
    await q.unsafe(SEED_GRADES);
  });
  console.log("OK: накладные, рейсы, продажи, партии и справочники склад/калибр сброшены; пользователи и направления отгрузки не тронуты.");
} finally {
  await sql.end({ timeout: 5 });
}
