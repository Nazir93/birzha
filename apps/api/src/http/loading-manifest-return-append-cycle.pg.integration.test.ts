import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";
import { and, eq, inArray, like } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";

const pgUrl = process.env.TEST_DATABASE_URL;
const PREFIX = "RET-APP-IT-";
const dir = path.dirname(fileURLToPath(import.meta.url));
const DEST = "001";
const GRADE = "pg-n5";

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

async function seedRefs(db: DbClient): Promise<void> {
  await db
    .insert(schema.warehouses)
    .values([
      { id: "wh-manas", code: "MANAS", name: "Манас" },
      { id: "wh-derbent", code: "DERBENT", name: "Дербент" },
    ])
    .onConflictDoNothing();
  await db
    .insert(schema.productGrades)
    .values({
      id: GRADE,
      code: "№5",
      displayName: "Калибр №5",
      sortOrder: 5,
      isActive: true,
      productGroup: "Помидоры",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.shipDestinations)
    .values({ code: DEST, displayName: "Москва", sortOrder: 10, isActive: true })
    .onConflictDoNothing();
}

async function cleanup(db: DbClient): Promise<void> {
  const manifests = await db
    .select({ id: schema.loadingManifests.id })
    .from(schema.loadingManifests)
    .where(like(schema.loadingManifests.manifestNumber, `${PREFIX}%`));
  const manifestIds = manifests.map((m) => m.id);
  if (manifestIds.length > 0) {
    await db
      .delete(schema.loadingManifestLines)
      .where(inArray(schema.loadingManifestLines.manifestId, manifestIds));
    await db.delete(schema.loadingManifests).where(inArray(schema.loadingManifests.id, manifestIds));
  }

  const docs = await db
    .select({ id: schema.purchaseDocuments.id })
    .from(schema.purchaseDocuments)
    .where(like(schema.purchaseDocuments.documentNumber, `${PREFIX}%`));
  const docIds = docs.map((d) => d.id);
  if (docIds.length === 0) {
    return;
  }
  const lines = await db
    .select({ batchId: schema.purchaseDocumentLines.batchId })
    .from(schema.purchaseDocumentLines)
    .where(inArray(schema.purchaseDocumentLines.documentId, docIds));
  const batchIds = lines.map((l) => l.batchId).filter((id): id is string => Boolean(id));
  if (batchIds.length > 0) {
    await db
      .delete(schema.batchWarehouseWriteOffs)
      .where(inArray(schema.batchWarehouseWriteOffs.batchId, batchIds));
  }
  await db
    .delete(schema.purchaseDocumentLines)
    .where(inArray(schema.purchaseDocumentLines.documentId, docIds));
  await db.delete(schema.purchaseDocuments).where(inArray(schema.purchaseDocuments.id, docIds));
  if (batchIds.length > 0) {
    await db.delete(schema.batches).where(inArray(schema.batches.id, batchIds));
  }
}

describe.skipIf(!pgUrl)("возврат на склад ↔ догрузка в ПН (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });
    await seedRefs(db);
    await cleanup(db);
  }, 60_000);

  afterAll(async () => {
    if (db) {
      await cleanup(db);
    }
    await sql.end({ timeout: 10 });
  });

  it("вернул → догрузил несколько раз; частичный и полный; два склада", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });

    async function createPurchase(docId: string, warehouseId: string, netKg: number): Promise<string> {
      const createDoc = await app.inject({
        method: "POST",
        url: "/purchase-documents",
        payload: {
          id: docId,
          documentNumber: `${PREFIX}${docId}`,
          docDate: "2026-10-12",
          warehouseId,
          supplierName: "IT-cycle",
          lines: [
            {
              productGradeId: GRADE,
              grossKg: netKg + 5,
              packageCount: 10,
              pricePerKg: 40,
              lineTotalKopecks: lineKop(netKg, 40),
            },
          ],
        },
      });
      expect(createDoc.statusCode, createDoc.body).toBe(201);
      const detailRes = await app.inject({ method: "GET", url: `/purchase-documents/${docId}` });
      expect(detailRes.statusCode, detailRes.body).toBe(200);
      const detail = JSON.parse(detailRes.body) as { lines: { batchId: string; totalKg: number }[] };
      const batchId = detail.lines[0]?.batchId;
      expect(batchId).toBeTruthy();
      return batchId!;
    }

    async function lineGrams(manifestId: string, batchId: string): Promise<bigint> {
      const [row] = await db
        .select({ grams: schema.loadingManifestLines.grams })
        .from(schema.loadingManifestLines)
        .where(
          and(
            eq(schema.loadingManifestLines.manifestId, manifestId),
            eq(schema.loadingManifestLines.batchId, batchId),
          ),
        )
        .limit(1);
      return row?.grams ?? 0n;
    }

    async function returnKg(batchId: string, kg: number): Promise<void> {
      const res = await app.inject({
        method: "POST",
        url: `/batches/${encodeURIComponent(batchId)}/warehouse-write-off`,
        payload: { kind: "quality_reject", kg },
      });
      expect(res.statusCode, res.body).toBe(200);
    }

    async function appendBatch(manifestId: string, batchId: string): Promise<void> {
      const res = await app.inject({
        method: "POST",
        url: `/loading-manifests/${encodeURIComponent(manifestId)}/add-batches`,
        payload: { batchIds: [batchId] },
      });
      expect(res.statusCode, res.body).toBe(200);
    }

    try {
      const manasBatch = await createPurchase(`${PREFIX}pd-manas`, "wh-manas", 100);
      const derbentBatch = await createPurchase(`${PREFIX}pd-derbent`, "wh-derbent", 80);

      const manasManifestId = `${PREFIX}lm-manas`;
      const derbentManifestId = `${PREFIX}lm-derbent`;

      const createManas = await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: manasManifestId,
          manifestNumber: `${PREFIX}ПН-manas`,
          docDate: "2026-10-12",
          warehouseId: "wh-manas",
          destinationCode: DEST,
          batchIds: [manasBatch],
        },
      });
      expect(createManas.statusCode, createManas.body).toBe(201);
      expect(await lineGrams(manasManifestId, manasBatch)).toBe(100_000n);

      const createDerbent = await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: derbentManifestId,
          manifestNumber: `${PREFIX}ПН-derbent`,
          docDate: "2026-10-12",
          warehouseId: "wh-derbent",
          destinationCode: DEST,
          batchIds: [derbentBatch],
        },
      });
      expect(createDerbent.statusCode, createDerbent.body).toBe(201);
      expect(await lineGrams(derbentManifestId, derbentBatch)).toBe(80_000n);

      // Частичный цикл на Манасе ×3
      for (let round = 1; round <= 3; round += 1) {
        await returnKg(manasBatch, 30);
        expect(await lineGrams(manasManifestId, manasBatch), `manas after return ${round}`).toBe(70_000n);
        await appendBatch(manasManifestId, manasBatch);
        expect(await lineGrams(manasManifestId, manasBatch), `manas after append ${round}`).toBe(100_000n);
      }

      // Полный возврат → догрузка ×2
      for (let round = 1; round <= 2; round += 1) {
        await returnKg(manasBatch, 100);
        expect(await lineGrams(manasManifestId, manasBatch), `full return ${round}`).toBe(0n);
        await appendBatch(manasManifestId, manasBatch);
        expect(await lineGrams(manasManifestId, manasBatch), `full append ${round}`).toBe(100_000n);
      }

      // Дербент: свой цикл, Манас не трогаем
      await returnKg(derbentBatch, 40);
      expect(await lineGrams(derbentManifestId, derbentBatch)).toBe(40_000n);
      expect(await lineGrams(manasManifestId, manasBatch)).toBe(100_000n);
      await appendBatch(derbentManifestId, derbentBatch);
      expect(await lineGrams(derbentManifestId, derbentBatch)).toBe(80_000n);
      expect(await lineGrams(manasManifestId, manasBatch)).toBe(100_000n);

      // Догрузка с другого склада в ПН Манаса — разрешена
      await returnKg(derbentBatch, 80);
      const cross = await app.inject({
        method: "POST",
        url: `/loading-manifests/${encodeURIComponent(manasManifestId)}/add-batches`,
        payload: { batchIds: [derbentBatch] },
      });
      expect(cross.statusCode, cross.body).toBe(200);
      expect(await lineGrams(manasManifestId, derbentBatch)).toBe(80_000n);
    } finally {
      await app.close();
      await cleanup(db);
    }
  }, 120_000);
});
