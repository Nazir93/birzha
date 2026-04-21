import path from "node:path";
import { fileURLToPath } from "node:url";

import { Batch, Trip } from "@birzha/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "../../db/client.js";
import * as schema from "../../db/schema.js";

import { DrizzleBatchRepository } from "./drizzle-batch.repository.js";
import { DrizzleTripRepository } from "./drizzle-trip.repository.js";
import { DrizzleTripShipmentRepository } from "./drizzle-trip-shipment.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("DrizzleTripShipmentRepository (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;
  let shipments: DrizzleTripShipmentRepository;
  let trips: DrizzleTripRepository;
  let batches: DrizzleBatchRepository;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
    shipments = new DrizzleTripShipmentRepository(db);
    trips = new DrizzleTripRepository(db);
    batches = new DrizzleBatchRepository(db);
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("append и aggregate после связанных trip/batch", async () => {
    const tripId = `it-ship-trip-${crypto.randomUUID()}`;
    const batchId = `it-ship-batch-${crypto.randomUUID()}`;

    await trips.save(Trip.create({ id: tripId, tripNumber: `Н-${tripId.slice(0, 6)}` }));

    const batch = Batch.create({
      id: batchId,
      purchaseId: "p-it",
      totalKg: 500,
      pricePerKg: 2,
      distribution: "on_hand",
    });
    await batches.save(batch);

    await shipments.append({
      id: `line-${crypto.randomUUID()}`,
      tripId,
      batchId,
      grams: 300_000n,
      packageCount: 15n,
    });

    const agg = await shipments.aggregateByTripId(tripId);
    expect(agg.totalGrams).toBe(300_000n);
    expect(agg.totalPackageCount).toBe(15n);
    expect(agg.byBatch).toEqual([{ batchId, grams: 300_000n, packageCount: 15n }]);
  });
});
