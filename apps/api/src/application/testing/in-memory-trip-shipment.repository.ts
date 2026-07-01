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

  async deleteByBatchIds(batchIds: string[]): Promise<void> {
    if (batchIds.length === 0) {
      return;
    }
    const set = new Set(batchIds);
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (set.has(this.rows[i]!.batchId)) {
        this.rows.splice(i, 1);
      }
    }
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

  async reduceForTripAndBatch(
    tripId: string,
    batchId: string,
    gramsToRemove: bigint,
    packageCountToRemove: bigint | null,
  ): Promise<void> {
    if (gramsToRemove <= 0n) {
      return;
    }
    let gramsLeft = gramsToRemove;
    let pkgLeft = packageCountToRemove ?? 0n;
    for (let i = 0; i < this.rows.length && gramsLeft > 0n; i++) {
      const row = this.rows[i]!;
      if (row.tripId !== tripId || row.batchId !== batchId) {
        continue;
      }
      if (row.grams <= gramsLeft) {
        gramsLeft -= row.grams;
        if (row.packageCount != null && row.packageCount > 0n && pkgLeft > 0n) {
          pkgLeft -= row.packageCount < pkgLeft ? row.packageCount : pkgLeft;
        }
        this.rows.splice(i, 1);
        i -= 1;
        continue;
      }
      row.grams -= gramsLeft;
      if (row.packageCount != null && row.packageCount > 0n && pkgLeft > 0n) {
        const removePkg = row.packageCount < pkgLeft ? row.packageCount : pkgLeft;
        row.packageCount = row.packageCount - removePkg > 0n ? row.packageCount - removePkg : null;
      }
      gramsLeft = 0n;
    }
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
