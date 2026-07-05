import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { AUTH_ACCESS_COOKIE_NAME } from "../auth/constants.js";
import { hashPassword } from "../auth/password-scrypt.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { clearLoginLockStateForTests } from "./register-auth-routes.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("auth HTTP (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;
  let userId: string;
  let login: string;
  const password = "test-auth-secret-99";

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });
    userId = randomUUID();
    login = `u_auth_${randomUUID().slice(0, 8)}`;
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
  }, 60_000);

  afterAll(async () => {
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await sql.end({ timeout: 10 });
  });

  beforeEach(() => {
    clearLoginLockStateForTests();
  });

  async function createGlobalUser(roleCode: string, plainPassword: string): Promise<{ id: string; login: string }> {
    const id = randomUUID();
    const loginName = `u_${roleCode}_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.users).values({
      id,
      login: loginName,
      passwordHash: hashPassword(plainPassword),
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId: id,
      roleCode,
      scopeType: "global",
      scopeId: "",
    });
    return { id, login: loginName };
  }

  it("POST /auth/login, GET /auth/me по Bearer и cookie, неверный пароль 401", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
    });
    const app = await buildApp({ env, db });
    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login, password: "wrong" },
    });
    expect(bad.statusCode).toBe(401);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login, password },
    });
    expect(loginRes.statusCode).toBe(200);
    const parsed = JSON.parse(loginRes.body) as { token: string };
    expect(parsed.token.length).toBeGreaterThan(20);
    const setCookie = loginRes.headers["set-cookie"];
    const setCookieStr = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie);
    expect(setCookieStr).toContain(AUTH_ACCESS_COOKIE_NAME);

    const meBearer = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${parsed.token}` },
    });
    expect(meBearer.statusCode).toBe(200);
    const bodyBearer = JSON.parse(meBearer.body) as { user: { id: string; login: string; roles: { roleCode: string }[] } };
    expect(bodyBearer.user.id).toBe(userId);
    expect(bodyBearer.user.login).toBe(login);
    expect(bodyBearer.user.roles.some((r) => r.roleCode === "admin")).toBe(true);

    const firstCookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
    const cookiePair = firstCookie.split(";")[0]!.trim();
    const meCookie = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookiePair },
    });
    expect(meCookie.statusCode).toBe(200);

    await app.close();
  });

  it("POST /auth/login ограничивает частые попытки входа", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
    });
    const app = await buildApp({ env, db });

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { login, password: `wrong-${i}` },
      });
      expect(res.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login, password: "wrong-limited" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "too_many_attempts" });

    await app.close();
  });

  it("REQUIRE_API_AUTH: без JWT на бизнес-маршрут 401; с admin — 200; seller не создаёт рейс (403)", async () => {
    const sellerId = randomUUID();
    const sellerLogin = `u_seller_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.users).values({
      id: sellerId,
      login: sellerLogin,
      passwordHash: hashPassword(password),
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId: sellerId,
      roleCode: "seller",
      scopeType: "global",
      scopeId: "",
    });

    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "true",
    });
    const app = await buildApp({ env, db });

    const noJwt = await app.inject({ method: "GET", url: "/trips" });
    expect(noJwt.statusCode).toBe(401);

    const loginAdmin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login, password },
    });
    const adminTok = (JSON.parse(loginAdmin.body) as { token: string }).token;
    const tripsOk = await app.inject({
      method: "GET",
      url: "/trips",
      headers: { authorization: `Bearer ${adminTok}` },
    });
    expect(tripsOk.statusCode).toBe(200);

    const loginSeller = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: sellerLogin, password },
    });
    const sellerTok = (JSON.parse(loginSeller.body) as { token: string }).token;
    const createTrip = await app.inject({
      method: "POST",
      url: "/trips",
      headers: { authorization: `Bearer ${sellerTok}` },
      payload: { id: `trip_${randomUUID()}`, tripNumber: "99" },
    });
    expect(createTrip.statusCode).toBe(403);

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, sellerId));
    await db.delete(schema.users).where(eq(schema.users.id, sellerId));
    await app.close();
  });

  it("REQUIRE_API_AUTH: кладовщик не POST /warehouses; admin — 201", async () => {
    const whUserId = randomUUID();
    const whLogin = `u_wh2_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.users).values({
      id: whUserId,
      login: whLogin,
      passwordHash: hashPassword(password),
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId: whUserId,
      roleCode: "warehouse",
      scopeType: "global",
      scopeId: "",
    });

    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "true",
    });
    const app = await buildApp({ env, db });

    const whTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login: whLogin, password } })).body,
    ) as { token: string }).token;
    const forbidden = await app.inject({
      method: "POST",
      url: "/warehouses",
      headers: { authorization: `Bearer ${whTok}`, "content-type": "application/json" },
      payload: { name: "Склад из теста", code: `t${randomUUID().slice(0, 6)}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const adminTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login, password } })).body,
    ) as { token: string }).token;
    const ok = await app.inject({
      method: "POST",
      url: "/warehouses",
      headers: { authorization: `Bearer ${adminTok}`, "content-type": "application/json" },
      payload: { name: "Склад админа", code: `A${randomUUID().slice(0, 4)}` },
    });
    expect(ok.statusCode).toBe(201);

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, whUserId));
    await db.delete(schema.users).where(eq(schema.users.id, whUserId));
    await app.close();
  });

  it("REQUIRE_API_AUTH: роли для purchase-documents и counterparties", async () => {
    const purchaser = await createGlobalUser("purchaser", password);
    const accountant = await createGlobalUser("accountant", password);
    const seller = await createGlobalUser("seller", password);

    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "true",
    });
    const app = await buildApp({ env, db });

    const adminTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login, password } })).body,
    ) as { token: string }).token;
    const purchaserTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login: purchaser.login, password } })).body,
    ) as { token: string }).token;
    const accountantTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login: accountant.login, password } })).body,
    ) as { token: string }).token;
    const sellerTok = (JSON.parse(
      (await app.inject({ method: "POST", url: "/auth/login", payload: { login: seller.login, password } })).body,
    ) as { token: string }).token;

    const warehouseId = `wh_auth_${randomUUID().slice(0, 8)}`;
    const gradeId = `pg_auth_${randomUUID().slice(0, 8)}`;

    const whCreate = await app.inject({
      method: "POST",
      url: "/warehouses",
      headers: { authorization: `Bearer ${adminTok}` },
      payload: { name: `Auth WH ${warehouseId}`, code: `W${warehouseId.slice(-4).toUpperCase()}` },
    });
    expect(whCreate.statusCode).toBe(201);
    const createdWh = JSON.parse(whCreate.body) as { warehouse: { id: string } };

    const gradeCreate = await app.inject({
      method: "POST",
      url: "/product-grades",
      headers: { authorization: `Bearer ${adminTok}` },
      payload: { id: gradeId, code: `№${Math.floor(Math.random() * 90) + 10}`, displayName: "Auth grade", sortOrder: 1 },
    });
    expect(gradeCreate.statusCode).toBe(201);
    const createdGrade = JSON.parse(gradeCreate.body) as { productGrade: { id: string } };

    const docId = `pd_auth_${randomUUID().slice(0, 8)}`;
    const purchaserCreate = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      headers: { authorization: `Bearer ${purchaserTok}` },
      payload: {
        id: docId,
        documentNumber: `AUTH-${Date.now()}`,
        docDate: "2026-07-01",
        warehouseId: createdWh.warehouse.id,
        supplierName: "Auth supplier",
        lines: [
          {
            productGradeId: createdGrade.productGrade.id,
            totalKg: 10,
            packageCount: 2,
            pricePerKg: 30,
            lineTotalKopecks: 30_000,
          },
        ],
      },
    });
    expect(purchaserCreate.statusCode).toBe(201);

    const sellerCreate = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      headers: { authorization: `Bearer ${sellerTok}` },
      payload: {
        id: `pd_forbid_${randomUUID().slice(0, 8)}`,
        documentNumber: "FORBID",
        docDate: "2026-07-01",
        warehouseId: createdWh.warehouse.id,
        supplierName: "Forbidden",
        lines: [
          {
            productGradeId: createdGrade.productGrade.id,
            totalKg: 5,
            packageCount: 1,
            pricePerKg: 10,
            lineTotalKopecks: 5_000,
          },
        ],
      },
    });
    expect(sellerCreate.statusCode).toBe(403);

    const accountantCounterparty = await app.inject({
      method: "POST",
      url: "/counterparties",
      headers: { authorization: `Bearer ${accountantTok}` },
      payload: { displayName: `Auth buyer ${Date.now()}` },
    });
    expect(accountantCounterparty.statusCode).toBe(201);

    const sellerCounterparty = await app.inject({
      method: "POST",
      url: "/counterparties",
      headers: { authorization: `Bearer ${sellerTok}` },
      payload: { displayName: `Seller forbidden ${Date.now()}` },
    });
    expect(sellerCounterparty.statusCode).toBe(403);

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, purchaser.id));
    await db.delete(schema.users).where(eq(schema.users.id, purchaser.id));
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, accountant.id));
    await db.delete(schema.users).where(eq(schema.users.id, accountant.id));
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, seller.id));
    await db.delete(schema.users).where(eq(schema.users.id, seller.id));
    await app.close();
  });
});
