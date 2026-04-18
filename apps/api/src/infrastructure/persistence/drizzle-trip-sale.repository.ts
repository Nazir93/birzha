import { and, eq } from "drizzle-orm";

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
      clientLabel: row.clientLabel?.trim() || null,
      counterpartyId: row.counterpartyId?.trim() || null,
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
