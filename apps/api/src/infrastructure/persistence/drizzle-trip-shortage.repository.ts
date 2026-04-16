import { and, eq } from "drizzle-orm";

import type {
  TripShortageAggregate,
  TripShortageAppend,
  TripShortageRepository,
} from "../../application/ports/trip-shortage-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { tripBatchShortages } from "../../db/schema.js";

export class DrizzleTripShortageRepository implements TripShortageRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: TripShortageAppend): Promise<void> {
    await this.db.insert(tripBatchShortages).values({
      id: row.id,
      tripId: row.tripId,
      batchId: row.batchId,
      grams: row.grams,
      reason: row.reason,
    });
  }

  async totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(tripBatchShortages)
      .where(and(eq(tripBatchShortages.tripId, tripId), eq(tripBatchShortages.batchId, batchId)));
    let sum = 0n;
    for (const r of rows) {
      sum += r.grams;
    }
    return sum;
  }

  async aggregateByTripId(tripId: string): Promise<TripShortageAggregate> {
    const rows = await this.db.select().from(tripBatchShortages).where(eq(tripBatchShortages.tripId, tripId));
    const byBatch = new Map<string, bigint>();
    let total = 0n;
    for (const r of rows) {
      total += r.grams;
      byBatch.set(r.batchId, (byBatch.get(r.batchId) ?? 0n) + r.grams);
    }
    const lines = [...byBatch.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([batchId, grams]) => ({ batchId, grams }));
    return { totalGrams: total, byBatch: lines };
  }
}
