import type {
  TripShipmentAggregate,
  TripShipmentAppend,
  TripShipmentRepository,
} from "../ports/trip-shipment-repository.port.js";

export class InMemoryTripShipmentRepository implements TripShipmentRepository {
  private readonly rows: TripShipmentAppend[] = [];

  async append(row: TripShipmentAppend): Promise<void> {
    this.rows.push(row);
  }

  async totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint> {
    let sum = 0n;
    for (const r of this.rows) {
      if (r.tripId === tripId && r.batchId === batchId) {
        sum += r.grams;
      }
    }
    return sum;
  }

  async aggregateByTripId(tripId: string): Promise<TripShipmentAggregate> {
    const relevant = this.rows.filter((r) => r.tripId === tripId);
    const byBatch = new Map<string, bigint>();
    let total = 0n;
    for (const r of relevant) {
      total += r.grams;
      byBatch.set(r.batchId, (byBatch.get(r.batchId) ?? 0n) + r.grams);
    }
    const lines = [...byBatch.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([batchId, grams]) => ({ batchId, grams }));
    return { totalGrams: total, byBatch: lines };
  }
}
