import { and, eq } from "drizzle-orm";

import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleRepository,
} from "../../application/ports/trip-sale-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { tripBatchSales } from "../../db/schema.js";

export class DrizzleTripSaleRepository implements TripSaleRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: TripSaleAppend): Promise<void> {
    await this.db.insert(tripBatchSales).values({
      id: row.id,
      tripId: row.tripId,
      batchId: row.batchId,
      saleId: row.saleId,
      grams: row.grams,
      pricePerKgKopecks: row.pricePerKgKopecks,
      revenueKopecks: row.revenueKopecks,
      cashKopecks: row.cashKopecks,
      debtKopecks: row.debtKopecks,
    });
  }

  async totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(tripBatchSales)
      .where(and(eq(tripBatchSales.tripId, tripId), eq(tripBatchSales.batchId, batchId)));
    let sum = 0n;
    for (const r of rows) {
      sum += r.grams;
    }
    return sum;
  }

  async aggregateByTripId(tripId: string): Promise<TripSaleAggregate> {
    const rows = await this.db.select().from(tripBatchSales).where(eq(tripBatchSales.tripId, tripId));
    const byBatchGrams = new Map<string, bigint>();
    const byBatchRevenue = new Map<string, bigint>();
    const byBatchCash = new Map<string, bigint>();
    const byBatchDebt = new Map<string, bigint>();
    let totalGrams = 0n;
    let totalRevenue = 0n;
    let totalCash = 0n;
    let totalDebt = 0n;
    for (const r of rows) {
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
