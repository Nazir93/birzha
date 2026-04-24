import { and, count, eq, inArray } from "drizzle-orm";

import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleRepository,
} from "../../application/ports/trip-sale-repository.port.js";
import { buildTripSaleAggregateFromRows } from "../../application/trip/trip-sale-aggregate.js";
import type { DbClient } from "../../db/client.js";
import { tripBatchSales } from "../../db/schema.js";

export class DrizzleTripSaleRepository implements TripSaleRepository {
  constructor(private readonly db: DbClient) {}

  async countByCounterpartyId(counterpartyId: string): Promise<number> {
    const r = await this.db
      .select({ c: count() })
      .from(tripBatchSales)
      .where(eq(tripBatchSales.counterpartyId, counterpartyId));
    return Number(r[0]?.c ?? 0);
  }

  async deleteByBatchIds(batchIds: string[]): Promise<void> {
    if (batchIds.length === 0) {
      return;
    }
    await this.db.delete(tripBatchSales).where(inArray(tripBatchSales.batchId, batchIds));
  }

  async append(row: TripSaleAppend): Promise<void> {
    const uid = row.recordedByUserId?.trim();
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
      clientLabel: row.clientLabel?.trim() || null,
      counterpartyId: row.counterpartyId?.trim() || null,
      recordedByUserId: uid || null,
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

  async aggregateByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleAggregate> {
    const whereClause = filter
      ? and(
          eq(tripBatchSales.tripId, tripId),
          eq(tripBatchSales.recordedByUserId, filter.onlyRecordedByUserId),
        )
      : eq(tripBatchSales.tripId, tripId);
    const rows = await this.db.select().from(tripBatchSales).where(whereClause);
    return buildTripSaleAggregateFromRows(
      rows.map((r) => ({
        batchId: r.batchId,
        grams: r.grams,
        revenueKopecks: r.revenueKopecks,
        cashKopecks: r.cashKopecks,
        debtKopecks: r.debtKopecks,
        clientLabel: r.clientLabel,
      })),
    );
  }
}
