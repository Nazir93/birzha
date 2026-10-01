import type {
  SupplierPaymentAppend,
  SupplierPaymentRecord,
  SupplierPaymentRepository,
} from "../../application/ports/supplier-payment-repository.port.js";

function toRecord(row: SupplierPaymentAppend): SupplierPaymentRecord {
  return {
    id: row.id,
    purchaseDocumentId: row.purchaseDocumentId,
    supplierId: row.supplierId ?? null,
    amountKopecks: row.amountKopecks,
    method: row.method,
    paidAt: row.paidAt,
    comment: row.comment ?? null,
    recordedByUserId: row.recordedByUserId ?? null,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class InMemorySupplierPaymentRepository implements SupplierPaymentRepository {
  private readonly rows: SupplierPaymentRecord[] = [];

  async append(row: SupplierPaymentAppend): Promise<void> {
    this.rows.push(toRecord(row));
  }

  async findById(id: string): Promise<SupplierPaymentRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  async listByDocumentId(documentId: string): Promise<SupplierPaymentRecord[]> {
    return this.rows
      .filter((r) => r.purchaseDocumentId === documentId)
      .slice()
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  }

  async sumPaidByDocumentId(documentId: string): Promise<bigint> {
    let s = 0n;
    for (const r of this.rows) {
      if (r.purchaseDocumentId === documentId) {
        s += r.amountKopecks;
      }
    }
    return s;
  }

  async sumPaidByDocumentIds(documentIds: string[]): Promise<Map<string, bigint>> {
    const m = new Map<string, bigint>();
    for (const id of documentIds) {
      m.set(id, 0n);
    }
    const set = new Set(documentIds);
    for (const r of this.rows) {
      if (!set.has(r.purchaseDocumentId)) {
        continue;
      }
      m.set(r.purchaseDocumentId, (m.get(r.purchaseDocumentId) ?? 0n) + r.amountKopecks);
    }
    return m;
  }
}
