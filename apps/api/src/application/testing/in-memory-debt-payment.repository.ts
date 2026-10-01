import type {
  DebtPaymentAppend,
  DebtPaymentRecord,
  DebtPaymentRepository,
} from "../../application/ports/debt-payment-repository.port.js";

function toRecord(row: DebtPaymentAppend): DebtPaymentRecord {
  return {
    id: row.id,
    saleId: row.saleId,
    tripId: row.tripId,
    counterpartyId: row.counterpartyId ?? null,
    clientLabel: row.clientLabel ?? null,
    amountKopecks: row.amountKopecks,
    method: row.method,
    paidAt: row.paidAt,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemoryDebtPaymentRepository implements DebtPaymentRepository {
  private readonly rows: DebtPaymentRecord[] = [];

  async append(row: DebtPaymentAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<DebtPaymentRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async listBySaleId(saleId: string): Promise<DebtPaymentRecord[]> {
    return this.rows
      .filter((r) => r.saleId === saleId)
      .slice()
      .sort((a, b) => {
        const t = b.paidAt.getTime() - a.paidAt.getTime();
        if (t !== 0) {
          return t;
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  async sumPaidBySaleId(saleId: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      if (r.saleId === saleId) {
        s += r.amountKopecks;
      }
    }
    return s;
  }

  async sumPaidByTripId(tripId: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      if (r.tripId === tripId) {
        s += r.amountKopecks;
      }
    }
    return s;
  }

  async sumPaidBySaleIds(saleIds: string[]): Promise<Map<string, bigint>> {
    const set = new Set(saleIds);
    const m = new Map<string, bigint>();
    for (const id of saleIds) {
      m.set(id, 0n);
    }
    for (const r of this.rows) {
      if (!set.has(r.saleId)) {
        continue;
      }
      m.set(r.saleId, (m.get(r.saleId) ?? 0n) + r.amountKopecks);
    }
    return m;
  }
}
