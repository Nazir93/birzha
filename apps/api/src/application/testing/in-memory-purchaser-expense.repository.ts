import type {
  PurchaserExpenseAppend,
  PurchaserExpenseListFilter,
  PurchaserExpenseRecord,
  PurchaserExpenseRepository,
} from "../../application/ports/purchaser-expense-repository.port.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toRecord(row: PurchaserExpenseAppend): PurchaserExpenseRecord {
  return {
    id: row.id,
    expenseDate: row.expenseDate,
    category: row.category,
    amountKopecks: row.amountKopecks,
    purchaserUserId: row.purchaserUserId ?? null,
    purchaserLabel: row.purchaserLabel ?? null,
    loadingManifestId: row.loadingManifestId ?? null,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemoryPurchaserExpenseRepository implements PurchaserExpenseRepository {
  private readonly rows: PurchaserExpenseRecord[] = [];

  async append(row: PurchaserExpenseAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<PurchaserExpenseRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async list(filter: PurchaserExpenseListFilter): Promise<PurchaserExpenseRecord[]> {
    const idSet =
      filter.loadingManifestIds && filter.loadingManifestIds.length > 0
        ? new Set(filter.loadingManifestIds)
        : null;
    return this.rows
      .filter((r) => {
        if (filter.purchaserUserId && (r.purchaserUserId ?? "") !== filter.purchaserUserId) {
          return false;
        }
        if (filter.loadingManifestId && (r.loadingManifestId ?? "") !== filter.loadingManifestId) {
          return false;
        }
        if (idSet && !idSet.has(r.loadingManifestId ?? "")) {
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
      .sort((a, b) => b.expenseDate.getTime() - a.expenseDate.getTime());
  }

  async sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      const day = ymd(r.expenseDate);
      if (day >= fromYmd && day <= toYmd) {
        s += r.amountKopecks;
      }
    }
    return s;
  }

  async sumByLoadingManifestIds(loadingManifestIds: readonly string[]): Promise<bigint> {
    const idSet = new Set(loadingManifestIds.map((id) => id.trim()).filter(Boolean));
    if (idSet.size === 0) {
      return 0n;
    }
    let s = 0n;
    for (const r of this.rows) {
      if (r.loadingManifestId && idSet.has(r.loadingManifestId)) {
        s += r.amountKopecks;
      }
    }
    return s;
  }
}
