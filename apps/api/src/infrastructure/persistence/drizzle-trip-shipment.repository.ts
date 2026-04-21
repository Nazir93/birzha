import { and, eq } from "drizzle-orm";

import type {
  TripShipmentAggregate,
  TripShipmentAppend,
  TripShipmentRepository,
} from "../../application/ports/trip-shipment-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { tripBatchShipments } from "../../db/schema.js";

export class DrizzleTripShipmentRepository implements TripShipmentRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: TripShipmentAppend): Promise<void> {
    await this.db.insert(tripBatchShipments).values({
      id: row.id,
      tripId: row.tripId,
      batchId: row.batchId,
      grams: row.grams,
      packageCount: row.packageCount,
    });
  }

  async totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(and(eq(tripBatchShipments.tripId, tripId), eq(tripBatchShipments.batchId, batchId)));
    let sum = 0n;
    for (const r of rows) {
      sum += r.grams;
    }
    return sum;
  }

  async aggregateByTripId(tripId: string): Promise<TripShipmentAggregate> {
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(eq(tripBatchShipments.tripId, tripId));

    const byGrams = new Map<string, bigint>();
    const byPackages = new Map<string, bigint>();
    let total = 0n;
    let totalPkg = 0n;
    for (const r of rows) {
      total += r.grams;
      byGrams.set(r.batchId, (byGrams.get(r.batchId) ?? 0n) + r.grams);
      const p = r.packageCount ?? 0n;
      totalPkg += p;
      byPackages.set(r.batchId, (byPackages.get(r.batchId) ?? 0n) + p);
    }
    const batchIds = new Set([...byGrams.keys(), ...byPackages.keys()]);
    const lines = [...batchIds]
      .sort((a, b) => a.localeCompare(b))
      .map((batchId) => ({
        batchId,
        grams: byGrams.get(batchId) ?? 0n,
        packageCount: byPackages.get(batchId) ?? 0n,
      }));
    return { totalGrams: total, totalPackageCount: totalPkg, byBatch: lines };
  }
}
