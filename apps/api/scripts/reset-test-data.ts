/**
 * Очистка **данных** PostgreSQL для ручного тестирования: схема не трогается.
 *
 * - Удаляет: движения рейса, накладные, партии, рейсы, `sync_processed_actions`, контрагентов, склады, калибры.
 * - Не трогает: `users`, `user_roles`, `roles` (логин и роли остаются).
 * - Снова вставляет **склады и калибры** как в миграции `drizzle/0011_…` (Манас/Каякент, №5… — как у заказчика).
 *
 *   cd apps/api
 *   pnpm db:reset-test-data
 *
 * Нужен `DATABASE_URL` в `apps/api/.env`. На production делайте бэкап `pg_dump` заранее.
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
    sync_processed_actions,
    purchase_document_lines,
    purchase_documents,
    batches,
    trips,
    counterparties,
    warehouses,
    product_grades
  CASCADE
`;

const SEED_WAREHOUSES = `
  INSERT INTO warehouses (id, code, name) VALUES
    ('wh-manas', 'MANAS', 'Манас'),
    ('wh-kayakent', 'KAYAKENT', 'Каякент')
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
    await q.unsafe(SEED_GRADES);
  });
  console.log("OK: данные сброшены; склады и калибры — как в сиде. Пользователи и роли не изменены.");
} finally {
  await sql.end({ timeout: 5 });
}
