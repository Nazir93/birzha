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

describe.skipIf(!pgUrl)("admin dashboard summary stock breakdown (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;

  const suffix = randomUUID().slice(0, 8);
  const wh1Id = `dash_wh1_${suffix}`;
  const wh2Id = `dash_wh2_${suffix}`;
  const grade1Id = `dash_g1_${suffix}`;
  const grade2Id = `dash_g2_${suffix}`;
  const batch1Id = `dash_b1_${suffix}`;
  const batch2Id = `dash_b2_${suffix}`;
  const doc1Id = `dash_doc1_${suffix}`;
  const doc2Id = `dash_doc2_${suffix}`;
  const line1Id = `dash_ln1_${suffix}`;
  const line2Id = `dash_ln2_${suffix}`;

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });

    await db.insert(schema.warehouses).values([
      { id: wh1Id, code: `D1${suffix}`, name: `Dash WH1 ${suffix}` },
      { id: wh2Id, code: `D2${suffix}`, name: `Dash WH2 ${suffix}` },
    ]);
    await db.insert(schema.productGrades).values([
      {
        id: grade1Id,
        code: "№5",
        displayName: "Калибр №5",
        productGroup: "Помидоры",
      },
      {
        id: grade2Id,
        code: "№6",
        displayName: "Калибр №6",
        productGroup: "Помидоры",
      },
    ]);

    const batch1Total = 500_000n;
    await db.insert(schema.batches).values({
      id: batch1Id,
      purchaseId: doc1Id,
      totalGrams: batch1Total,
      pendingInboundGrams: 0n,
      onWarehouseGrams: batch1Total,
      inTransitGrams: 0n,
      soldGrams: 0n,
      writtenOffGrams: 0n,
      pricePerKg: "20",
      warehouseId: wh1Id,
    });

    const batch2Total = 1_000_000n;
    await db.insert(schema.batches).values({
      id: batch2Id,
      purchaseId: doc2Id,
      totalGrams: batch2Total,
      pendingInboundGrams: 0n,
      onWarehouseGrams: 200_000n,
      inTransitGrams: 300_000n,
      soldGrams: 0n,
      writtenOffGrams: 0n,
      pricePerKg: "30",
      warehouseId: wh2Id,
    });

    await db.insert(schema.purchaseDocuments).values([
      {
        id: doc1Id,
        documentNumber: `DASH-D1-${suffix}`,
        docDate: new Date("2026-03-01"),
        warehouseId: wh1Id,
      },
      {
        id: doc2Id,
        documentNumber: `DASH-D2-${suffix}`,
        docDate: new Date("2026-03-02"),
        warehouseId: wh2Id,
      },
    ]);

    await db.insert(schema.purchaseDocumentLines).values([
      {
        id: line1Id,
        documentId: doc1Id,
        lineNo: 1,
        productGradeId: grade1Id,
        quantityGrams: batch1Total,
        packageCount: 40n,
        pricePerKg: "20",
        lineTotalKopecks: 1_000_000n,
        batchId: batch1Id,
      },
      {
        id: line2Id,
        documentId: doc2Id,
        lineNo: 1,
        productGradeId: grade2Id,
        quantityGrams: batch2Total,
        packageCount: 100n,
        pricePerKg: "30",
        lineTotalKopecks: 3_000_000n,
        batchId: batch2Id,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(schema.purchaseDocumentLines).where(eq(schema.purchaseDocumentLines.id, line1Id));
    await db.delete(schema.purchaseDocumentLines).where(eq(schema.purchaseDocumentLines.id, line2Id));
    await db.delete(schema.purchaseDocuments).where(eq(schema.purchaseDocuments.id, doc1Id));
    await db.delete(schema.purchaseDocuments).where(eq(schema.purchaseDocuments.id, doc2Id));
    await db.delete(schema.batches).where(eq(schema.batches.id, batch1Id));
    await db.delete(schema.batches).where(eq(schema.batches.id, batch2Id));
    await db.delete(schema.productGrades).where(eq(schema.productGrades.id, grade1Id));
    await db.delete(schema.productGrades).where(eq(schema.productGrades.id, grade2Id));
    await db.delete(schema.warehouses).where(eq(schema.warehouses.id, wh1Id));
    await db.delete(schema.warehouses).where(eq(schema.warehouses.id, wh2Id));
    await sql.end({ timeout: 10 });
  });

  it("byGrade / byWarehouse / byProductGroup — кг, ящики, сумма по закупу", async () => {
    const summary = await getAdminDashboardSummary(db, {});

    const g5 = summary.warehouse.byGrade.find((g) => g.productGradeId === grade1Id);
    const g6 = summary.warehouse.byGrade.find((g) => g.productGradeId === grade2Id);
    expect(g5).toMatchObject({ kg: 500, packages: 40, valueKopecks: "1000000" });
    expect(g6).toMatchObject({ kg: 500, packages: 50, valueKopecks: "1500000" });

    expect(summary.warehouse.stockTotals).toMatchObject({
      kg: 1000,
      packages: 90,
      valueKopecks: "2500000",
    });

    const wh1 = summary.warehouse.byWarehouse.find((w) => w.warehouseId === wh1Id);
    const wh2 = summary.warehouse.byWarehouse.find((w) => w.warehouseId === wh2Id);
    expect(wh1).toMatchObject({ kg: 500, packages: 40, valueKopecks: "1000000" });
    expect(wh2).toMatchObject({ kg: 500, packages: 50, valueKopecks: "1500000" });

    const toms = summary.warehouse.byProductGroup.find((p) => p.productGroup === "Помидоры");
    expect(toms).toMatchObject({ kg: 1000, packages: 90, valueKopecks: "2500000" });

    expect(summary.warehouse.warehouseKg).toBe(700);
  });
});

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
    expect(summary.warehouse.stockTotals.kg).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(summary.warehouse.byGrade)).toBe(true);
    expect(Array.isArray(summary.warehouse.byWarehouse)).toBe(true);
    expect(Array.isArray(summary.warehouse.byProductGroup)).toBe(true);
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
