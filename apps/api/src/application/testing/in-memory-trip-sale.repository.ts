import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleRepository,
} from "../ports/trip-sale-repository.port.js";
import { buildTripSaleAggregateFromRows } from "../trip/trip-sale-aggregate.js";

export class InMemoryTripSaleRepository implements TripSaleRepository {
  private readonly rows: TripSaleAppend[] = [];

  async append(row: TripSaleAppend): Promise<void> {
    this.rows.push(row);
  }

  async countByCounterpartyId(counterpartyId: string): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.counterpartyId === counterpartyId) {
        n += 1;
      }
    }
    return n;
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

  async aggregateByTripId(tripId: string): Promise<TripSaleAggregate> {
    const relevant = this.rows.filter((r) => r.tripId === tripId);
    return buildTripSaleAggregateFromRows(
      relevant.map((r) => ({
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
