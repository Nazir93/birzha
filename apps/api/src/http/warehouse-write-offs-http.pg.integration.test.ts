import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("GET /warehouse-write-offs (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;

  const whId = `wo_wh_${randomUUID().slice(0, 8)}`;
  const whOtherId = `wo_wh_o_${randomUUID().slice(0, 8)}`;
  const gradeId = `wo_g_${randomUUID().slice(0, 8)}`;
  const batchId = `wo_b_${randomUUID().slice(0, 8)}`;
  const docId = `wo_doc_${randomUUID().slice(0, 8)}`;
  const lineId = `wo_line_${randomUUID().slice(0, 8)}`;
  const writeOffId = `wo_off_${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });

    await db.insert(schema.warehouses).values([
      { id: whId, code: `W${whId.slice(-8)}`, name: "WH write-off IT" },
      { id: whOtherId, code: `O${whOtherId.slice(-8)}`, name: "WH other (filter)" },
    ]);
    await db.insert(schema.productGrades).values({
      id: gradeId,
      code: `IT${gradeId.slice(-4)}`,
      displayName: "IT grade write-off",
      productGroup: "Toms",
    });
    const totalG = BigInt(500_000);
    await db.insert(schema.batches).values({
      id: batchId,
      purchaseId: "p-wo-it",
      totalGrams: totalG,
      pendingInboundGrams: BigInt(0),
      onWarehouseGrams: totalG,
      inTransitGrams: BigInt(0),
      soldGrams: BigInt(0),
      writtenOffGrams: BigInt(10_000),
      pricePerKg: "10",
      warehouseId: whId,
    });
    await db.insert(schema.purchaseDocuments).values({
      id: docId,
      documentNumber: "WO-DOC-IT-99",
      docDate: new Date("2024-06-01"),
      warehouseId: whId,
    });
    await db.insert(schema.purchaseDocumentLines).values({
      id: lineId,
      documentId: docId,
      lineNo: 1,
      productGradeId: gradeId,
      quantityGrams: totalG,
      packageCount: null,
      pricePerKg: "10",
      lineTotalKopecks: BigInt(0),
      batchId,
    });
    await db.insert(schema.batchWarehouseWriteOffs).values({
      id: writeOffId,
      batchId,
      grams: BigInt(10_000),
      reason: "quality_reject",
    });
  }, 60_000);

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(schema.batchWarehouseWriteOffs).where(eq(schema.batchWarehouseWriteOffs.id, writeOffId));
    await db.delete(schema.purchaseDocumentLines).where(eq(schema.purchaseDocumentLines.id, lineId));
    await db.delete(schema.purchaseDocuments).where(eq(schema.purchaseDocuments.id, docId));
    await db.delete(schema.batches).where(eq(schema.batches.id, batchId));
    await db.delete(schema.productGrades).where(eq(schema.productGrades.id, gradeId));
    await db.delete(schema.warehouses).where(eq(schema.warehouses.id, whId));
    await db.delete(schema.warehouses).where(eq(schema.warehouses.id, whOtherId));
    await sql.end({ timeout: 10 });
  });

  it("по purchaseDocumentId — строки и totalKg", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const res = await app.inject({
      method: "GET",
      url: `/warehouse-write-offs?purchaseDocumentId=${encodeURIComponent(docId)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      documentId: string;
      totalKg: number;
      lines: { kg: number; batchId: string; productGradeCode: string | null }[];
    };
    expect(body.documentId).toBe(docId);
    expect(body.totalKg).toBe(10);
    expect(body.lines.some((l) => l.batchId === batchId && l.kg === 10)).toBe(true);
    await app.close();
  });

  it("без purchaseDocumentId — ledger recent с полями склада и накладной", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const res = await app.inject({
      method: "GET",
      url: `/warehouse-write-offs?limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ledger: string;
      warehouseIdFilter: string | null;
      limit: number;
      totalKg: number;
      lines: {
        id: string;
        batchId: string;
        kg: number;
        purchaseDocumentId: string;
        warehouseName: string | null;
      }[];
    };
    expect(body.ledger).toBe("recent");
    expect(body.warehouseIdFilter).toBeNull();
    expect(body.limit).toBe(50);
    const hit = body.lines.find((l) => l.id === writeOffId);
    expect(hit).toBeDefined();
    expect(hit!.batchId).toBe(batchId);
    expect(hit!.purchaseDocumentId).toBe(docId);
    expect(hit!.kg).toBe(10);
    expect(hit!.warehouseName).toContain("write-off IT");
    await app.close();
  });

  it("warehouseId=другой склад — пустой список при несовпадении", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const res = await app.inject({
      method: "GET",
      url: `/warehouse-write-offs?warehouseId=${encodeURIComponent(whOtherId)}&limit=20`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { lines: { id: string }[]; totalKg: number };
    expect(body.lines.some((l) => l.id === writeOffId)).toBe(false);
    expect(body.totalKg).toBe(0);
    await app.close();
  });

  it("warehouseId=склад партии — запись попадает в журнал", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const res = await app.inject({
      method: "GET",
      url: `/warehouse-write-offs?warehouseId=${encodeURIComponent(whId)}&limit=100`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { lines: { id: string }[] };
    expect(body.lines.some((l) => l.id === writeOffId)).toBe(true);
    await app.close();
  });

  it("limit больше 500 — 400 validation_error", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const res = await app.inject({ method: "GET", url: "/warehouse-write-offs?limit=501" });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toBe("validation_error");
    await app.close();
  });
});
