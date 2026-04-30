import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { AUTH_ACCESS_COOKIE_NAME } from "../auth/constants.js";
import { hashPassword } from "../auth/password-scrypt.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";

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

    for (let i = 0; i < 10; i++) {
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

  it("REQUIRE_API_AUTH: POST /sync sell_from_trip — бухгалтер получает sync_forbidden (200 rejected)", async () => {
    const accountantId = randomUUID();
    const accountantLogin = `u_acc_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.users).values({
      id: accountantId,
      login: accountantLogin,
      passwordHash: hashPassword(password),
      isActive: true,
    });
    await db.insert(schema.userRoles).values({
      userId: accountantId,
      roleCode: "accountant",
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

    const loginAcc = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: accountantLogin, password },
    });
    expect(loginAcc.statusCode).toBe(200);
    const token = (JSON.parse(loginAcc.body) as { token: string }).token;

    const syncRes = await app.inject({
      method: "POST",
      url: "/sync",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        deviceId: "d-sync-forbid",
        localActionId: "la-sync-forbid-1",
        actionType: "sell_from_trip",
        payload: {
          batchId: "b-any",
          tripId: "t-any",
          kg: 1,
          saleId: "sale-any",
          pricePerKg: 1,
        },
      },
    });
    expect(syncRes.statusCode).toBe(200);
    const syncBody = JSON.parse(syncRes.body) as { status: string; errorCode?: string; actionId?: string };
    expect(syncBody.status).toBe("rejected");
    expect(syncBody.errorCode).toBe("sync_forbidden");
    expect(syncBody.actionId).toBe("la-sync-forbid-1");

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, accountantId));
    await db.delete(schema.users).where(eq(schema.users.id, accountantId));
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
});
