import type {
  TripExpenseAppend,
  TripExpenseRecord,
  TripExpenseRepository,
} from "../../application/ports/trip-expense-repository.port.js";

function toRecord(row: TripExpenseAppend): TripExpenseRecord {
  return {
    id: row.id,
    tripId: row.tripId,
    category: row.category,
    amountKopecks: row.amountKopecks,
    expenseDate: row.expenseDate,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemoryTripExpenseRepository implements TripExpenseRepository {
  private readonly rows: TripExpenseRecord[] = [];

  async append(row: TripExpenseAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<TripExpenseRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async listByTripId(tripId: string): Promise<TripExpenseRecord[]> {
    return this.rows
      .filter((r) => r.tripId === tripId)
      .slice()
      .sort((a, b) => b.expenseDate.getTime() - a.expenseDate.getTime());
  }

  async listInPeriod(fromYmd: string, toYmd: string): Promise<TripExpenseRecord[]> {
    return this.rows
      .filter((r) => {
        const day = r.expenseDate.toISOString().slice(0, 10);
        return day >= fromYmd && day <= toYmd;
      })
      .slice()
      .sort((a, b) => b.expenseDate.getTime() - a.expenseDate.getTime());
  }

  async sumByTripId(tripId: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      if (r.tripId === tripId) {
        s += r.amountKopecks;
      }
    }
    return s;
  }
}
