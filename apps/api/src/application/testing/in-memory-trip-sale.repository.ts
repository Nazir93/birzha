import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleRepository,
} from "../ports/trip-sale-repository.port.js";

export class InMemoryTripSaleRepository implements TripSaleRepository {
  private readonly rows: TripSaleAppend[] = [];

  async append(row: TripSaleAppend): Promise<void> {
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

  async aggregateByTripId(tripId: string): Promise<TripSaleAggregate> {
    const relevant = this.rows.filter((r) => r.tripId === tripId);
    const byBatchGrams = new Map<string, bigint>();
    const byBatchRevenue = new Map<string, bigint>();
    const byBatchCash = new Map<string, bigint>();
    const byBatchDebt = new Map<string, bigint>();
    let totalGrams = 0n;
    let totalRevenue = 0n;
    let totalCash = 0n;
    let totalDebt = 0n;
    for (const r of relevant) {
      totalGrams += r.grams;
      totalRevenue += r.revenueKopecks;
      totalCash += r.cashKopecks;
      totalDebt += r.debtKopecks;
      byBatchGrams.set(r.batchId, (byBatchGrams.get(r.batchId) ?? 0n) + r.grams);
      byBatchRevenue.set(r.batchId, (byBatchRevenue.get(r.batchId) ?? 0n) + r.revenueKopecks);
      byBatchCash.set(r.batchId, (byBatchCash.get(r.batchId) ?? 0n) + r.cashKopecks);
      byBatchDebt.set(r.batchId, (byBatchDebt.get(r.batchId) ?? 0n) + r.debtKopecks);
    }
    const batchIds = new Set([...byBatchGrams.keys(), ...byBatchRevenue.keys()]);
    const lines = [...batchIds]
      .sort((a, b) => a.localeCompare(b))
      .map((batchId) => ({
        batchId,
        grams: byBatchGrams.get(batchId) ?? 0n,
        revenueKopecks: byBatchRevenue.get(batchId) ?? 0n,
        cashKopecks: byBatchCash.get(batchId) ?? 0n,
        debtKopecks: byBatchDebt.get(batchId) ?? 0n,
      }));
    return {
      totalGrams,
      totalRevenueKopecks: totalRevenue,
      totalCashKopecks: totalCash,
      totalDebtKopecks: totalDebt,
      byBatch: lines,
    };
  }
}
