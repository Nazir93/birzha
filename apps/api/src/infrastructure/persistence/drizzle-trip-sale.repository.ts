import { and, count, desc, eq, inArray } from "drizzle-orm";

import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleLineRecord,
  TripSaleRepository,
} from "../../application/ports/trip-sale-repository.port.js";
import { buildTripSaleAggregateFromRows } from "../../application/trip/trip-sale-aggregate.js";
import type { DbClient } from "../../db/client.js";
import { tripBatchSales } from "../../db/schema.js";

function rowToLine(r: typeof tripBatchSales.$inferSelect): TripSaleLineRecord {
  return {
    id: r.id,
    tripId: r.tripId,
    batchId: r.batchId,
    saleId: r.saleId,
    grams: r.grams,
    pricePerKgKopecks: r.pricePerKgKopecks,
    revenueKopecks: r.revenueKopecks,
    cashKopecks: r.cashKopecks,
    debtKopecks: r.debtKopecks,
    cardTransferKopecks: r.cardTransferKopecks,
    saleChannel: r.saleChannel === "wholesale" ? "wholesale" : "retail",
    clientLabel: r.clientLabel,
    counterpartyId: r.counterpartyId,
    wholesaleBuyerId: r.wholesaleBuyerId,
    recordedByUserId: r.recordedByUserId,
    packageCount: r.packageCount,
    recordedAt: r.recordedAt,
  };
}

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
      cardTransferKopecks: row.cardTransferKopecks,
      clientLabel: row.clientLabel?.trim() || null,
      counterpartyId: row.counterpartyId?.trim() || null,
      recordedByUserId: uid || null,
      saleChannel: row.saleChannel,
      wholesaleBuyerId: row.wholesaleBuyerId?.trim() || null,
      packageCount: row.packageCount ?? null,
      recordedAt: row.recordedAt ?? new Date(),
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

  async listLinesByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleLineRecord[]> {
    const whereClause = filter
      ? and(
          eq(tripBatchSales.tripId, tripId),
          eq(tripBatchSales.recordedByUserId, filter.onlyRecordedByUserId),
        )
      : eq(tripBatchSales.tripId, tripId);
    const rows = await this.db
      .select()
      .from(tripBatchSales)
      .where(whereClause)
      .orderBy(desc(tripBatchSales.recordedAt), desc(tripBatchSales.id));
    return rows.map(rowToLine);
  }

  async findLineById(lineId: string): Promise<TripSaleLineRecord | null> {
    const rows = await this.db.select().from(tripBatchSales).where(eq(tripBatchSales.id, lineId));
    const r = rows[0];
    return r ? rowToLine(r) : null;
  }

  async updateLine(row: TripSaleLineRecord): Promise<void> {
    await this.db
      .update(tripBatchSales)
      .set({
        grams: row.grams,
        pricePerKgKopecks: row.pricePerKgKopecks,
        revenueKopecks: row.revenueKopecks,
        cashKopecks: row.cashKopecks,
        debtKopecks: row.debtKopecks,
        cardTransferKopecks: row.cardTransferKopecks,
        saleChannel: row.saleChannel,
        clientLabel: row.clientLabel?.trim() || null,
        counterpartyId: row.counterpartyId?.trim() || null,
        wholesaleBuyerId: row.wholesaleBuyerId?.trim() || null,
        packageCount: row.packageCount ?? null,
      })
      .where(eq(tripBatchSales.id, row.id));
  }

  async deleteLineById(lineId: string): Promise<void> {
    await this.db.delete(tripBatchSales).where(eq(tripBatchSales.id, lineId));
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
        packageCount: r.packageCount ?? 0n,
        revenueKopecks: r.revenueKopecks,
        cashKopecks: r.cashKopecks,
        debtKopecks: r.debtKopecks,
        cardTransferKopecks: r.cardTransferKopecks,
        clientLabel: r.clientLabel,
        saleChannel: r.saleChannel === "wholesale" ? "wholesale" : "retail",
      })),
    );
  }
}
