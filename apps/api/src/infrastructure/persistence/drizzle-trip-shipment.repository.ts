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
