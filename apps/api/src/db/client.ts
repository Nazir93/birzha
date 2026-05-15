import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(connectionString: string): {
  db: DbClient;
  sql: ReturnType<typeof postgres>;
} {
  const sql = postgres(connectionString, {
    max: 10,
    connect_timeout: 30,
    idle_timeout: 60,
    /** Переподключение пула, чтобы «зависшие» соединения к БД не копились бесконечно. */
    max_lifetime: 60 * 30,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
