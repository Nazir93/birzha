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
const PREFIX = "DEST-SYNC-IT-";
const dir = path.dirname(fileURLToPath(import.meta.url));

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

/** Активные коды направлений на стенде (см. ship_destinations); legacy `moscow` часто is_active=false. */
const DEST_MOSCOW = "001";
const DEST_ASTRAKHAN = "002";

async function seedRefs(db: DbClient): Promise<void> {
  await db
    .insert(schema.warehouses)
    .values({ id: "wh-manas", code: "MANAS", name: "Манас" })
    .onConflictDoNothing();
  await db
    .insert(schema.productGrades)
    .values({
      id: "pg-n5",
      code: "№5",
      displayName: "Калибр №5",
      sortOrder: 5,
      isActive: true,
      productGroup: "Помидоры",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.shipDestinations)
    .values([
      { code: DEST_MOSCOW, displayName: "Москва", sortOrder: 10, isActive: true },
      { code: DEST_ASTRAKHAN, displayName: "Астрахань", sortOrder: 20, isActive: true },
    ])
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

describe.skipIf(!pgUrl)("POST assign-trip синхронизирует город ПН (PostgreSQL)", () => {
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

  it("привязка к рейсу другого города меняет destination ПН, номер и партию", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });

    const docId = `${PREFIX}pd-1`;
    const tripMoscowId = `${PREFIX}trip-msk`;
    const tripAstrakhanId = `${PREFIX}trip-ast`;
    const manifestId = `${PREFIX}lm-1`;

    try {
      const createDoc = await app.inject({
        method: "POST",
        url: "/purchase-documents",
        payload: {
          id: docId,
          documentNumber: `${PREFIX}NKL-0001`,
          docDate: "2026-07-19",
          warehouseId: "wh-manas",
          supplierName: "IT",
          lines: [
            {
              productGradeId: "pg-n5",
              grossKg: 55,
              packageCount: 10,
              pricePerKg: 40,
              lineTotalKopecks: lineKop(50, 40),
            },
          ],
        },
      });
      expect(createDoc.statusCode, createDoc.body).toBe(201);

      const detailRes = await app.inject({ method: "GET", url: `/purchase-documents/${docId}` });
      expect(detailRes.statusCode, detailRes.body).toBe(200);
      const detail = JSON.parse(detailRes.body) as { lines: { batchId: string }[] };
      const batchId = detail.lines[0]?.batchId;
      expect(batchId).toBeTruthy();

      for (const trip of [
        { id: tripMoscowId, tripNumber: `${PREFIX}MSK-01`, destinationCode: DEST_MOSCOW },
        { id: tripAstrakhanId, tripNumber: `${PREFIX}AST-01`, destinationCode: DEST_ASTRAKHAN },
      ]) {
        const tripRes = await app.inject({
          method: "POST",
          url: "/trips",
          payload: {
            id: trip.id,
            tripNumber: trip.tripNumber,
            destinationCode: trip.destinationCode,
            vehicleLabel: "IT",
            departedAt: "2026-07-19T12:00:00.000Z",
          },
        });
        expect(tripRes.statusCode, tripRes.body).toBe(201);
      }

      const createLm = await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: manifestId,
          manifestNumber: `${PREFIX}ПН-msk-${Date.now()}`,
          docDate: "2026-07-19",
          warehouseId: "wh-manas",
          destinationCode: DEST_MOSCOW,
          batchIds: [batchId!],
        },
      });
      expect(createLm.statusCode, createLm.body).toBe(201);

      const assign = await app.inject({
        method: "POST",
        url: `/loading-manifests/${manifestId}/assign-trip`,
        payload: { tripId: tripAstrakhanId },
      });
      expect(assign.statusCode, assign.body).toBe(200);

      const [manifest] = await db
        .select({
          tripId: schema.loadingManifests.tripId,
          destinationCode: schema.loadingManifests.destinationCode,
          manifestNumber: schema.loadingManifests.manifestNumber,
        })
        .from(schema.loadingManifests)
        .where(eq(schema.loadingManifests.id, manifestId))
        .limit(1);

      expect(manifest?.tripId).toBe(tripAstrakhanId);
      expect(manifest?.destinationCode).toBe(DEST_ASTRAKHAN);
      expect(manifest?.manifestNumber).toContain("Астрахань");
      expect(manifest?.manifestNumber).toContain(`${PREFIX}AST-01`);

      const [batch] = await db
        .select({ destination: schema.batches.destination })
        .from(schema.batches)
        .where(eq(schema.batches.id, batchId!))
        .limit(1);
      expect(batch?.destination).toBe(DEST_ASTRAKHAN);

      const change = await app.inject({
        method: "POST",
        url: `/loading-manifests/${manifestId}/assign-trip`,
        payload: { tripId: tripMoscowId },
      });
      expect(change.statusCode, change.body).toBe(200);

      const [afterChange] = await db
        .select({
          tripId: schema.loadingManifests.tripId,
          destinationCode: schema.loadingManifests.destinationCode,
          manifestNumber: schema.loadingManifests.manifestNumber,
        })
        .from(schema.loadingManifests)
        .where(eq(schema.loadingManifests.id, manifestId))
        .limit(1);

      expect(afterChange?.tripId).toBe(tripMoscowId);
      expect(afterChange?.destinationCode).toBe(DEST_MOSCOW);
      expect(afterChange?.manifestNumber).toContain("Москва");

      const [batchAfter] = await db
        .select({ destination: schema.batches.destination })
        .from(schema.batches)
        .where(eq(schema.batches.id, batchId!))
        .limit(1);
      expect(batchAfter?.destination).toBe(DEST_MOSCOW);
    } finally {
      await app.close();
      await cleanup(db);
    }
  }, 60_000);
});
