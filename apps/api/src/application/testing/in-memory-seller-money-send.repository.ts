import type {
  SellerMoneySendAppend,
  SellerMoneySendListFilter,
  SellerMoneySendRecord,
  SellerMoneySendRepository,
} from "../ports/seller-money-send-repository.port.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toRecord(row: SellerMoneySendAppend): SellerMoneySendRecord {
  return {
    id: row.id,
    tripId: row.tripId ?? null,
    sendDate: row.sendDate,
    amountKopecks: row.amountKopecks,
    recipient: row.recipient,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemorySellerMoneySendRepository implements SellerMoneySendRepository {
  private readonly rows: SellerMoneySendRecord[] = [];

  async append(row: SellerMoneySendAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<SellerMoneySendRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async list(filter: SellerMoneySendListFilter): Promise<SellerMoneySendRecord[]> {
    return this.rows
      .filter((r) => {
        if (filter.tripId && (r.tripId ?? "") !== filter.tripId) {
          return false;
        }
        if (filter.recordedByUserId && (r.recordedByUserId ?? "") !== filter.recordedByUserId) {
          return false;
        }
        const day = ymd(r.sendDate);
        if (filter.fromYmd && day < filter.fromYmd) {
          return false;
        }
        if (filter.toYmd && day > filter.toYmd) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.sendDate.getTime() - a.sendDate.getTime());
  }

  async sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      const day = ymd(r.sendDate);
      if (day >= fromYmd && day <= toYmd) {
        s += r.amountKopecks;
      }
    }
    return s;
  }
}
