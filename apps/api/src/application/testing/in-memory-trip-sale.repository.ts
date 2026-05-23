import type {
  TripSaleAggregate,
  TripSaleAppend,
  TripSaleLineRecord,
  TripSaleRepository,
} from "../ports/trip-sale-repository.port.js";
import { buildTripSaleAggregateFromRows } from "../trip/trip-sale-aggregate.js";

function appendToLine(row: TripSaleAppend): TripSaleLineRecord {
  return {
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
    saleChannel: row.saleChannel,
    clientLabel: row.clientLabel ?? null,
    counterpartyId: row.counterpartyId ?? null,
    wholesaleBuyerId: row.wholesaleBuyerId ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    packageCount: row.packageCount ?? null,
    recordedAt: row.recordedAt ?? new Date(),
  };
}

function compareTripSaleLinesNewestFirst(a: TripSaleLineRecord, b: TripSaleLineRecord): number {
  const t = b.recordedAt.getTime() - a.recordedAt.getTime();
  if (t !== 0) {
    return t;
  }
  return b.id.localeCompare(a.id, "ru");
}

export class InMemoryTripSaleRepository implements TripSaleRepository {
  private readonly rows: TripSaleLineRecord[] = [];

  async append(row: TripSaleAppend): Promise<void> {
    this.rows.push(appendToLine(row));
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

  async listLinesByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleLineRecord[]> {
    return this.rows
      .filter((r) => {
        if (r.tripId !== tripId) {
          return false;
        }
        if (!filter) {
          return true;
        }
        return (r.recordedByUserId ?? null) === filter.onlyRecordedByUserId;
      })
      .slice()
      .sort(compareTripSaleLinesNewestFirst);
  }

  async findLineById(lineId: string): Promise<TripSaleLineRecord | null> {
    return this.rows.find((r) => r.id === lineId) ?? null;
  }

  async updateLine(row: TripSaleLineRecord): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i < 0) {
      return;
    }
    this.rows[i] = row;
  }

  async deleteLineById(lineId: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === lineId);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async aggregateByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleAggregate> {
    const relevant = this.rows.filter((r) => {
      if (r.tripId !== tripId) {
        return false;
      }
      if (!filter) {
        return true;
      }
      return (r.recordedByUserId ?? null) === filter.onlyRecordedByUserId;
    });
    return buildTripSaleAggregateFromRows(
      relevant.map((r) => ({
        batchId: r.batchId,
        grams: r.grams,
        packageCount: r.packageCount ?? 0n,
        revenueKopecks: r.revenueKopecks,
        cashKopecks: r.cashKopecks,
        debtKopecks: r.debtKopecks,
        cardTransferKopecks: r.cardTransferKopecks,
        clientLabel: r.clientLabel,
        saleChannel: r.saleChannel,
      })),
    );
  }
}
