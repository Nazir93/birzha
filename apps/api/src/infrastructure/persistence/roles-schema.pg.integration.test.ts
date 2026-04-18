import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "../../db/client.js";
import * as schema from "../../db/schema.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("users/roles schema (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("миграция 0009: сид ролей MVP (8 шт.)", async () => {
    const rows = await db.select().from(schema.roles);
    expect(rows).toHaveLength(8);
    const codes = rows.map((r) => r.code).sort();
    expect(codes).toEqual([
      "accountant",
      "admin",
      "logistics",
      "manager",
      "purchaser",
      "receiver",
      "seller",
      "warehouse",
    ]);
  });
});
