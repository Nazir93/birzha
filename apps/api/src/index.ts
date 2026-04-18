import "dotenv/config";

import { InMemoryBatchRepository } from "./application/testing/in-memory-batch.repository.js";
import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";
import { createDb } from "./db/client.js";

const env = loadEnv();

let db: ReturnType<typeof createDb>["db"] | null = null;
let sql: ReturnType<typeof createDb>["sql"] | null = null;

if (env.DATABASE_URL) {
  const created = createDb(env.DATABASE_URL);
  db = created.db;
  sql = created.sql;
}

/** Без PostgreSQL в development включаем тот же in-memory контур, что в тестах — иначе `purchaseDocumentsApi` и партии в `/meta` остаются `disabled`. */
const devMemoryBatches =
  !env.DATABASE_URL && env.NODE_ENV === "development" ? new InMemoryBatchRepository() : undefined;

const app = await buildApp({
  env,
  db,
  ...(devMemoryBatches ? { batchRepository: devMemoryBatches } : {}),
});

if (devMemoryBatches) {
  app.log.warn(
    "DATABASE_URL не задан: партии и накладная работают в памяти (только NODE_ENV=development). После перезапуска данные обнуляются; для постоянной БД задайте DATABASE_URL.",
  );
}

const close = async () => {
  await app.close();
  if (sql) {
    await sql.end({ timeout: 5 });
  }
};

process.on("SIGINT", () => {
  void close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void close().then(() => process.exit(0));
});

await app.listen({ port: env.PORT, host: env.HOST });
