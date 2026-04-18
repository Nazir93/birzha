/**
 * HTTP API для E2E (браузер).
 *
 * Режим по умолчанию: in-memory репозитории, без PostgreSQL (порт 3099).
 *
 * Режим **PostgreSQL** (навигация по ролям, `REQUIRE_API_AUTH`): задайте **`E2E_DATABASE_URL`**
 * и **`E2E_JWT_SECRET`** (≥ 32 символов). Перед стартом выполняются миграции и сид
 * `e2e-seed-role-users.ts`. См. `README.md`, раздел E2E.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { InMemoryBatchRepository } from "./application/testing/in-memory-batch.repository.js";
import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";
import { createDb } from "./db/client.js";
import { seedE2eRoleUsers } from "./e2e-seed-role-users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number.parseInt(process.env.PORT ?? "3099", 10);
const pgUrl = process.env.E2E_DATABASE_URL;
const jwtSecret = process.env.E2E_JWT_SECRET ?? process.env.JWT_SECRET;

if (pgUrl && jwtSecret && jwtSecret.length >= 32) {
  const requireAuth = process.env.E2E_REQUIRE_API_AUTH !== "false";
  const env = loadEnv({
    NODE_ENV: "development",
    PORT: String(port),
    DATABASE_URL: pgUrl,
    JWT_SECRET: jwtSecret,
    REQUIRE_API_AUTH: requireAuth ? "true" : "false",
  });

  const { db, sql } = createDb(pgUrl);
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  await seedE2eRoleUsers(db);

  const app = await buildApp({ env, db });

  const close = async () => {
    await app.close();
    await sql.end({ timeout: 10 });
  };

  process.on("SIGINT", () => {
    void close().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void close().then(() => process.exit(0));
  });

  await app.listen({ port: env.PORT, host: "127.0.0.1" });
} else {
  if (pgUrl && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error("E2E_DATABASE_URL задан: укажите E2E_JWT_SECRET (минимум 32 символа)");
  }

  const env = loadEnv({
    NODE_ENV: "development",
    PORT: String(port),
    DATABASE_URL: undefined,
  });

  const batches = new InMemoryBatchRepository();
  const app = await buildApp({ env, db: null, batchRepository: batches });

  await app.listen({ port: env.PORT, host: "127.0.0.1" });
}
