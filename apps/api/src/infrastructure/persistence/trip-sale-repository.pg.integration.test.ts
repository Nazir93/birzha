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
import { DrizzleTripSaleRepository } from "./drizzle-trip-sale.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("DrizzleTripSaleRepository (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;
  let sales: DrizzleTripSaleRepository;
  let trips: DrizzleTripRepository;
  let batches: DrizzleBatchRepository;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
    sales = new DrizzleTripSaleRepository(db);
    trips = new DrizzleTripRepository(db);
    batches = new DrizzleBatchRepository(db);
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("append и aggregate с FK trip/batch", async () => {
    const tripId = `it-sale-trip-${crypto.randomUUID()}`;
    const batchId = `it-sale-batch-${crypto.randomUUID()}`;

    await trips.save(Trip.create({ id: tripId, tripNumber: `Н-${tripId.slice(0, 6)}` }));
    await batches.save(
      Batch.create({
        id: batchId,
        purchaseId: "p-it",
        totalKg: 100,
        pricePerKg: 1,
        distribution: "on_hand",
      }),
    );

    await sales.append({
      id: `sale-${crypto.randomUUID()}`,
      tripId,
      batchId,
      saleId: "s-it",
      grams: 25_000n,
      pricePerKgKopecks: 100n,
      revenueKopecks: 2500n,
      cashKopecks: 2500n,
      debtKopecks: 0n,
    });

    const agg = await sales.aggregateByTripId(tripId);
    expect(agg.totalGrams).toBe(25_000n);
    expect(agg.totalRevenueKopecks).toBe(2500n);
    expect(agg.totalCashKopecks).toBe(2500n);
    expect(agg.totalDebtKopecks).toBe(0n);
    expect(agg.byBatch).toEqual([
      { batchId, grams: 25_000n, revenueKopecks: 2500n, cashKopecks: 2500n, debtKopecks: 0n },
    ]);
  });
});
