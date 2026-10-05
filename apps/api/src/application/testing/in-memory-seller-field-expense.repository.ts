import type {
  SellerFieldExpenseAppend,
  SellerFieldExpenseListFilter,
  SellerFieldExpenseRecord,
  SellerFieldExpenseRepository,
} from "../../application/ports/seller-field-expense-repository.port.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toRecord(row: SellerFieldExpenseAppend): SellerFieldExpenseRecord {
  return {
    id: row.id,
    tripId: row.tripId,
    expenseDate: row.expenseDate,
    category: row.category,
    amountKopecks: row.amountKopecks,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemorySellerFieldExpenseRepository implements SellerFieldExpenseRepository {
  private readonly rows: SellerFieldExpenseRecord[] = [];

  async append(row: SellerFieldExpenseAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<SellerFieldExpenseRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async list(filter: SellerFieldExpenseListFilter): Promise<SellerFieldExpenseRecord[]> {
    if (filter.tripIds && filter.tripIds.length === 0) {
      return [];
    }
    return this.rows
      .filter((r) => {
        if (filter.tripId && r.tripId !== filter.tripId) {
          return false;
        }
        if (filter.tripIds && !filter.tripIds.includes(r.tripId)) {
          return false;
        }
        if (filter.recordedByUserId && (r.recordedByUserId ?? "") !== filter.recordedByUserId) {
          return false;
        }
        const day = ymd(r.expenseDate);
        if (filter.fromYmd && day < filter.fromYmd) {
          return false;
        }
        if (filter.toYmd && day > filter.toYmd) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const byDate = b.expenseDate.getTime() - a.expenseDate.getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
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
