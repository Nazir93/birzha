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
    const byGrams = new Map<string, bigint>();
    const byPackages = new Map<string, bigint>();
    let total = 0n;
    let totalPkg = 0n;
    for (const r of relevant) {
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
