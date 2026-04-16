import initSqlJs, { type Database } from "sql.js";

let initPromise: Promise<Awaited<ReturnType<typeof initSqlJs>>> | null = null;

async function getSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!initPromise) {
    initPromise = initSqlJs();
  }
  return initPromise;
}

/**
 * SQLite в памяти (sql.js, без нативной сборки) для интеграционных тестов.
 * Схема упрощённая — при появлении Prisma/migrations заменить на реальную.
 */
export async function openMemorySqlite(): Promise<Database> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE batch_rows (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      total_kg REAL NOT NULL,
      price_per_kg REAL NOT NULL,
      pending_inbound_kg REAL NOT NULL,
      on_warehouse_kg REAL NOT NULL,
      in_transit_kg REAL NOT NULL,
      sold_kg REAL NOT NULL,
      written_off_kg REAL NOT NULL
    );
  `);
  return db;
}
