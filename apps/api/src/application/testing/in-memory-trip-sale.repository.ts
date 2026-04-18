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
