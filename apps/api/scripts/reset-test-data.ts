/**
 * Очистка **данных** PostgreSQL для тестового стенда: схема не трогается.
 *
 * - Удаляет: рейсы, отгрузки/продажи/недостачи по рейсу, погрузочные накладные, закупочные накладные и партии,
 *   списания/возвраты с склада, контрагентов, оптовиков.
 * - Не трогает: `users`, `user_roles`, `roles`, `ship_destinations`, **`warehouses`**, **`product_grades`**.
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
    wholesalers
  RESTART IDENTITY CASCADE
`;

const SEED_SHIP_DESTINATIONS = `
  INSERT INTO ship_destinations (code, display_name, sort_order, is_active) VALUES
    ('moscow', 'Москва', 10, true),
    ('regions', 'Регионы', 20, true),
    ('discount', 'Уценка / распродажа', 30, true),
    ('writeoff', 'Списание', 40, true)
  ON CONFLICT (code) DO NOTHING
`;

try {
  await sql.begin(async (q) => {
    await q.unsafe(TRUNCATE);
    await q.unsafe(SEED_SHIP_DESTINATIONS);
  });
  console.log(
    "OK: накладные, рейсы, продажи, партии, контрагенты и оптовики очищены; пользователи, склады, калибры и направления отгрузки не тронуты.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
