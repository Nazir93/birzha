import "dotenv/config";

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

const app = await buildApp({ env, db });

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
