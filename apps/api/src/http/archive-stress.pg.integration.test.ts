import path from "node:path";
import { fileURLToPath } from "node:url";

import { inArray, like } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";
import { createDb } from "../db/client.js";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { listLoadingManifestsForHttp } from "./loading-manifest-list-http.js";
import { listPurchaseDocumentsForHttp } from "./purchase-document-list-http.js";
import { DrizzleTripRepository } from "../infrastructure/persistence/drizzle-trip.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;
const PREFIX = "ARCHIVE-IT-";

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

async function seedWarehouses(db: DbClient): Promise<void> {
  await db.insert(schema.warehouses).values([
    { id: "wh-manas", code: "MANAS", name: "Манас" },
    { id: "wh-kayakent", code: "KAYAKENT", name: "Каякент" },
  ]).onConflictDoNothing();
  await db.insert(schema.productGrades).values([
    { id: "pg-n5", code: "№5", displayName: "Калибр №5", sortOrder: 5, isActive: true, productGroup: "Помидоры" },
  ]).onConflictDoNothing();
  await db.insert(schema.shipDestinations).values([
    { code: "moscow", displayName: "Москва", sortOrder: 10, isActive: true },
    { code: "regions", displayName: "Регионы", sortOrder: 20, isActive: true },
  ]).onConflictDoNothing();
}

async function cleanupArchiveIt(db: DbClient, sql: ReturnType<typeof createDb>["sql"]): Promise<void> {
  const tripRows = await db
    .select({ id: schema.trips.id })
    .from(schema.trips)
    .where(like(schema.trips.tripNumber, `${PREFIX}%`));
  const tripIds = tripRows.map((t) => t.id);
  if (tripIds.length > 0) {
    await db.delete(schema.tripBatchSales).where(inArray(schema.tripBatchSales.tripId, tripIds));
    await db.delete(schema.tripBatchShipments).where(inArray(schema.tripBatchShipments.tripId, tripIds));
    await db.delete(schema.trips).where(inArray(schema.trips.id, tripIds));
  }

  const docs = await db
    .select({ id: schema.purchaseDocuments.id })
    .from(schema.purchaseDocuments)
    .where(like(schema.purchaseDocuments.documentNumber, `${PREFIX}%`));
  const docIds = docs.map((d) => d.id);
  if (docIds.length > 0) {
    const lineRows = await db
      .select({ batchId: schema.purchaseDocumentLines.batchId })
      .from(schema.purchaseDocumentLines)
      .where(inArray(schema.purchaseDocumentLines.documentId, docIds));
    const batchIds = lineRows.map((l) => l.batchId).filter(Boolean) as string[];
    await db.delete(schema.purchaseDocumentLines).where(inArray(schema.purchaseDocumentLines.documentId, docIds));
    await db.delete(schema.purchaseDocuments).where(inArray(schema.purchaseDocuments.id, docIds));
    if (batchIds.length > 0) {
      await db.delete(schema.batches).where(inArray(schema.batches.id, batchIds));
    }
  }

  await sql`delete from loading_manifests where manifest_number like ${`${PREFIX}%`}`;
}

describe.skipIf(!pgUrl)("archive stress lists (PostgreSQL)", () => {
  let sql: ReturnType<typeof createDb>["sql"];
  let db: DbClient;

  beforeAll(async () => {
    const created = createDb(pgUrl!);
    sql = created.sql;
    db = created.db;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../drizzle") });
    await seedWarehouses(db);
    await cleanupArchiveIt(db, sql);
  }, 60_000);

  afterAll(async () => {
    if (db) {
      await cleanupArchiveIt(db, sql);
    }
    await sql.end({ timeout: 10 });
  });

  it("closed trip попадает в archived manifests и shipment-report", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: pgUrl,
      JWT_SECRET: "k".repeat(32),
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });

    const docId = `${PREFIX}pd-1`;
    const tripId = `${PREFIX}trip-1`;

    try {
      await app.inject({
        method: "POST",
        url: "/purchase-documents",
        payload: {
          id: docId,
          documentNumber: `${PREFIX}NKL-0001`,
          docDate: "2025-11-01",
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

      const detailRes = await app.inject({ method: "GET", url: `/purchase-documents/${docId}` });
      expect(detailRes.statusCode).toBe(200);
      const detail = JSON.parse(detailRes.body) as { lines: { batchId: string }[] };
      const batchId = detail.lines[0]?.batchId;
      expect(batchId).toBeTruthy();

      await app.inject({
        method: "POST",
        url: "/trips",
        payload: {
          id: tripId,
          tripNumber: `${PREFIX}Р-0001`,
          vehicleLabel: "IT",
          departedAt: "2025-11-02T08:00:00.000Z",
        },
      });

      const manifestId = `${PREFIX}lm-1`;
      await app.inject({
        method: "POST",
        url: "/loading-manifests",
        payload: {
          id: manifestId,
          manifestNumber: `${PREFIX}ПН-0001`,
          docDate: "2025-11-01",
          warehouseId: "wh-manas",
          destinationCode: "regions",
          batchIds: [batchId!],
        },
      });

      await app.inject({
        method: "POST",
        url: `/loading-manifests/${manifestId}/assign-trip`,
        payload: { tripId },
      });

      await app.inject({
        method: "POST",
        url: `/batches/${encodeURIComponent(batchId!)}/sell-from-trip`,
        payload: {
          tripId,
          kg: 50,
          saleId: `${PREFIX}sale-1`,
          pricePerKg: 55,
          packageCount: 10,
          paymentKind: "cash",
          saleChannel: "retail",
          clientLabel: "IT client",
        },
      });

      await app.inject({ method: "POST", url: `/trips/${tripId}/close`, payload: {} });

      const tripsRepo = new DrizzleTripRepository(db);
      const closed = await tripsRepo.list({ status: "closed", limit: 100 });
      expect(closed.some((t) => t.getId() === tripId)).toBe(true);

      const manifests = await listLoadingManifestsForHttp(db, { scope: "archived", limit: 50, offset: 0 });
      expect(manifests.listMeta.totalCount).toBeGreaterThanOrEqual(1);
      expect(manifests.loadingManifests.some((m) => m.tripId === tripId)).toBe(true);

      const docs = await listPurchaseDocumentsForHttp(db, { scope: "archived", limit: 50, offset: 0 });
      expect(docs.purchaseDocuments.some((d) => d.id === docId)).toBe(true);

      const reportRes = await app.inject({ method: "GET", url: `/trips/${tripId}/shipment-report` });
      expect(reportRes.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
