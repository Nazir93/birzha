import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { hashPassword } from "../auth/password-scrypt.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { getAdminDashboardSummary } from "./admin-dashboard-summary-http.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("admin dashboard summary (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("getAdminDashboardSummary with since does not throw", async () => {
    const summary = await getAdminDashboardSummary(db, { since: "2026-01-01" });
    expect(summary.trips.openCount).toBeGreaterThanOrEqual(0);
    expect(summary.warehouse.warehouseKg).toBeGreaterThanOrEqual(0);
  });

  it("GET /admin/dashboard-summary?since= returns 200 when authenticated", async () => {
    const login = `dash_${Date.now()}`;
    const password = "dash-summary-test-99";
    const userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      login,
      passwordHash: hashPassword(password),
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId,
      roleCode: "admin",
      scopeType: "global",
      scopeId: "",
    });

    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
    });
    const app = await buildApp({ env, db });

    try {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { login, password },
      });
      expect(loginRes.statusCode).toBe(200);
      const { token } = JSON.parse(loginRes.body) as { token: string };

      const res = await app.inject({
        method: "GET",
        url: "/admin/dashboard-summary?since=2026-01-01",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });
});
