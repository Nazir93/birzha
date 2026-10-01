import { and, eq, inArray } from "drizzle-orm";

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
      packageCount: row.packageCount,
    });
  }

  async deleteByBatchIds(batchIds: string[]): Promise<void> {
    if (batchIds.length === 0) {
      return;
    }
    await this.db.delete(tripBatchShortages).where(inArray(tripBatchShortages.batchId, batchIds));
  }

  async deleteAllForTripId(tripId: string): Promise<void> {
    await this.db.delete(tripBatchShortages).where(eq(tripBatchShortages.tripId, tripId));
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
    const byBatch = new Map<string, { grams: bigint; packageCount: bigint }>();
    let total = 0n;
    let totalPkg = 0n;
    for (const r of rows) {
      total += r.grams;
      const pkg = r.packageCount ?? 0n;
      totalPkg += pkg;
      const prev = byBatch.get(r.batchId) ?? { grams: 0n, packageCount: 0n };
      byBatch.set(r.batchId, {
        grams: prev.grams + r.grams,
        packageCount: prev.packageCount + pkg,
      });
    }
    const lines = [...byBatch.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([batchId, v]) => ({ batchId, grams: v.grams, packageCount: v.packageCount }));
    return { totalGrams: total, totalPackageCount: totalPkg, byBatch: lines };
  }
}
