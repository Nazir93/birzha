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
import { DrizzleTripShortageRepository } from "./drizzle-trip-shortage.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("DrizzleTripShortageRepository (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;
  let shortages: DrizzleTripShortageRepository;
  let trips: DrizzleTripRepository;
  let batches: DrizzleBatchRepository;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
    shortages = new DrizzleTripShortageRepository(db);
    trips = new DrizzleTripRepository(db);
    batches = new DrizzleBatchRepository(db);
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("append, totalGramsForTripAndBatch и aggregateByTripId", async () => {
    const tripId = `it-short-trip-${crypto.randomUUID()}`;
    const batchId = `it-short-batch-${crypto.randomUUID()}`;

    await trips.save(Trip.create({ id: tripId, tripNumber: `Н-${tripId.slice(0, 6)}` }));

    const batch = Batch.create({
      id: batchId,
      purchaseId: "p-it",
      totalKg: 500,
      pricePerKg: 2,
      distribution: "on_hand",
    });
    await batches.save(batch);

    const line1 = `line-${crypto.randomUUID()}`;
    const line2 = `line-${crypto.randomUUID()}`;

    await shortages.append({
      id: line1,
      tripId,
      batchId,
      grams: 10_000n,
      reason: "недостача 1",
    });
    await shortages.append({
      id: line2,
      tripId,
      batchId,
      grams: 25_000n,
      reason: "недостача 2",
    });

    expect(await shortages.totalGramsForTripAndBatch(tripId, batchId)).toBe(35_000n);

    const agg = await shortages.aggregateByTripId(tripId);
    expect(agg.totalGrams).toBe(35_000n);
    expect(agg.byBatch).toEqual([{ batchId, grams: 35_000n }]);
  });
});
