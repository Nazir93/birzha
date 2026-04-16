import type {
  TripShortageAggregate,
  TripShortageAppend,
  TripShortageRepository,
} from "../ports/trip-shortage-repository.port.js";

export class InMemoryTripShortageRepository implements TripShortageRepository {
  private readonly rows: TripShortageAppend[] = [];

  async append(row: TripShortageAppend): Promise<void> {
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

  async aggregateByTripId(tripId: string): Promise<TripShortageAggregate> {
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
