import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";
import { eq, inArray, like } from "drizzle-orm";
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
const PREFIX = "PROD-MM-IT-";
const dir = path.dirname(fileURLToPath(import.meta.url));
const DEST = "001";
const GRADE_TOMATO = "pg-n5";
const GRADE_CUCUMBER = "pg-prod-mm-cuc";

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

async function seedRefs(db: DbClient): Promise<void> {
  await db
    .insert(schema.warehouses)
    .values({ id: "wh-manas", code: "MANAS", name: "Манас" })
    .onConflictDoNothing();
  await db
    .insert(schema.productGrades)
    .values([
      {
        id: GRADE_TOMATO,
        code: "№5",
        displayName: "Калибр №5",
        sortOrder: 5,
        isActive: true,
        productGroup: "Помидоры",
      },
      {
        id: GRADE_CUCUMBER,
        code: "prod-mm-cuc",
        displayName: "Корнишон IT",
        sortOrder: 1,
        isActive: true,
        productGroup: "Огурцы",
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(schema.shipDestinations)
    .values({ code: DEST, displayName: "Москва", sortOrder: 10, isActive: true })
    .onConflictDoNothing();
}

async function cleanup(db: DbClient): Promise<void> {
  const tripRows = await db
    .select({ id: schema.trips.id })
    .from(schema.trips)
    .where(like(schema.trips.tripNumber, `${PREFIX}%`));
  const tripIds = tripRows.map((t) => t.id);

  const manifests = await db
    .select({ id: schema.loadingManifests.id })
    .from(schema.loadingManifests)
    .where(like(schema.loadingManifests.manifestNumber, `${PREFIX}%`));
  const manifestIds = manifests.map((m) => m.id);

  if (tripIds.length > 0) {
    await db.delete(schema.tripBatchShipments).where(inArray(schema.tripBatchShipments.tripId, tripIds));
  }
  if (manifestIds.length > 0) {
    await db
      .delete(schema.loadingManifestLines)
      .where(inArray(schema.loadingManifestLines.manifestId, manifestIds));
    await db.delete(schema.loadingManifests).where(inArray(schema.loadingManifests.id, manifestIds));
  }
  if (tripIds.length > 0) {
    await db.delete(schema.trips).where(inArray(schema.trips.id, tripIds));
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
  await db
    .delete(schema.purchaseDocumentLines)
    .where(inArray(schema.purchaseDocumentLines.documentId, docIds));
  await db.delete(schema.purchaseDocuments).where(inArray(schema.purchaseDocuments.id, docIds));
  if (batchIds.length > 0) {
    await db.delete(schema.batches).where(inArray(schema.batches.id, batchIds));
  }
}

describe.skipIf(!pgUrl)("погрузочная не принимает чужой товар рейса (PostgreSQL)", () => {
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

  it("помидоры нельзя назначить на рейс огурцов и догрузить в его накладную", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const tripId = `${PREFIX}trip-cuc`;
    const tomatoManifestId = `${PREFIX}lm-tom`;
    const cucumberManifestId = `${PREFIX}lm-cuc`;

    try {
      async function createPurchase(id: string, gradeId: string): Promise<string> {
        const createDoc = await app.inject({
          method: "POST",
          url: "/purchase-documents",
          payload: {
            id,
            documentNumber: `${PREFIX}${id}`,
            docDate: "2026-09-18",
            warehouseId: "wh-manas",
            supplierName: "IT",
            lines: [
              {
                productGradeId: gradeId,
                grossKg: 55,
                packageCount: 10,
                pricePerKg: 40,
                lineTotalKopecks: lineKop(50, 40),
              },
            ],
          },
        });
        expect(createDoc.statusCode, createDoc.body).toBe(201);
        const detailRes = await app.inject({ method: "GET", url: `/purchase-documents/${id}` });
        expect(detailRes.statusCode, detailRes.body).toBe(200);
        const detail = JSON.parse(detailRes.body) as { lines: { batchId: string }[] };
        const batchId = detail.lines[0]?.batchId;
        expect(batchId).toBeTruthy();
        return batchId!;
      }

      const tomatoBatchId = await createPurchase(`${PREFIX}pd-tom`, GRADE_TOMATO);
      const cucumberBatchId = await createPurchase(`${PREFIX}pd-cuc`, GRADE_CUCUMBER);

      const tripRes = await app.inject({
        method: "POST",
        url: "/trips",
        payload: {
          id: tripId,
          tripNumber: `${PREFIX}CUC-01`,
          destinationCode: DEST,
          productGroup: "Огурцы",
          vehicleLabel: "IT",
          departedAt: "2026-09-18T12:00:00.000Z",
        },
      });
      expect(tripRes.statusCode, tripRes.body).toBe(201);

      const tomatoLm = await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: tomatoManifestId,
          manifestNumber: `${PREFIX}ПН-tom`,
          docDate: "2026-09-18",
          warehouseId: "wh-manas",
          destinationCode: DEST,
          batchIds: [tomatoBatchId],
        },
      });
      expect(tomatoLm.statusCode, tomatoLm.body).toBe(201);

      const mismatch = await app.inject({
        method: "POST",
        url: `/loading-manifests/${tomatoManifestId}/assign-trip`,
        payload: { tripId },
      });
      expect(mismatch.statusCode, mismatch.body).toBe(400);
      const mismatchBody = JSON.parse(mismatch.body) as {
        error: string;
        tripProduct: string;
        batchProduct: string;
      };
      expect(mismatchBody.error).toBe("trip_product_mismatch");
      expect(mismatchBody.tripProduct).toBe("Огурцы");
      expect(mismatchBody.batchProduct).toBe("Помидоры");

      const [tomatoManifest] = await db
        .select({ tripId: schema.loadingManifests.tripId })
        .from(schema.loadingManifests)
        .where(eq(schema.loadingManifests.id, tomatoManifestId))
        .limit(1);
      expect(tomatoManifest?.tripId).toBeNull();

      const cucumberLm = await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: cucumberManifestId,
          manifestNumber: `${PREFIX}ПН-cuc`,
          docDate: "2026-09-18",
          warehouseId: "wh-manas",
          destinationCode: DEST,
          batchIds: [cucumberBatchId],
        },
      });
      expect(cucumberLm.statusCode, cucumberLm.body).toBe(201);

      const assignOk = await app.inject({
        method: "POST",
        url: `/loading-manifests/${cucumberManifestId}/assign-trip`,
        payload: { tripId },
      });
      expect(assignOk.statusCode, assignOk.body).toBe(200);

      const appendMismatch = await app.inject({
        method: "POST",
        url: `/loading-manifests/${cucumberManifestId}/add-batches`,
        payload: { batchIds: [tomatoBatchId] },
      });
      expect(appendMismatch.statusCode, appendMismatch.body).toBe(400);
      const appendBody = JSON.parse(appendMismatch.body) as { error: string };
      expect(appendBody.error).toBe("trip_product_mismatch");
    } finally {
      await app.close();
      await cleanup(db);
    }
  }, 60_000);
});
