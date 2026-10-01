import { desc, eq, inArray, sql } from "drizzle-orm";

import type {
  SupplierPaymentAppend,
  SupplierPaymentMethod,
  SupplierPaymentRecord,
  SupplierPaymentRepository,
} from "../../application/ports/supplier-payment-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { supplierPayments } from "../../db/schema.js";

function asMethod(raw: string): SupplierPaymentMethod {
  if (raw === "card" || raw === "bank") {
    return raw;
  }
  return "cash";
}

function rowToRecord(r: typeof supplierPayments.$inferSelect): SupplierPaymentRecord {
  return {
    id: r.id,
    purchaseDocumentId: r.purchaseDocumentId,
    supplierId: r.supplierId,
    amountKopecks: r.amountKopecks,
    method: asMethod(r.method),
    paidAt: r.paidAt,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzleSupplierPaymentRepository implements SupplierPaymentRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: SupplierPaymentAppend): Promise<void> {
    await this.db.insert(supplierPayments).values({
      id: row.id,
      purchaseDocumentId: row.purchaseDocumentId,
      supplierId: row.supplierId?.trim() || null,
      amountKopecks: row.amountKopecks,
      method: row.method,
      paidAt: row.paidAt,
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<SupplierPaymentRecord | null> {
    const rows = await this.db.select().from(supplierPayments).where(eq(supplierPayments.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(supplierPayments).where(eq(supplierPayments.id, id));
  }

  async listByDocumentId(documentId: string): Promise<SupplierPaymentRecord[]> {
    const rows = await this.db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.purchaseDocumentId, documentId))
      .orderBy(desc(supplierPayments.paidAt), desc(supplierPayments.createdAt));
    return rows.map(rowToRecord);
  }

  async sumPaidByDocumentId(documentId: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${supplierPayments.amountKopecks}), 0)` })
      .from(supplierPayments)
      .where(eq(supplierPayments.purchaseDocumentId, documentId));
    return BigInt(rows[0]?.s ?? 0);
  }

  async sumPaidByDocumentIds(documentIds: string[]): Promise<Map<string, bigint>> {
    const m = new Map<string, bigint>();
    for (const id of documentIds) {
      m.set(id, 0n);
    }
    if (documentIds.length === 0) {
      return m;
    }
    const rows = await this.db
      .select({
        documentId: supplierPayments.purchaseDocumentId,
        s: sql<bigint>`coalesce(sum(${supplierPayments.amountKopecks}), 0)`,
      })
      .from(supplierPayments)
      .where(inArray(supplierPayments.purchaseDocumentId, documentIds))
      .groupBy(supplierPayments.purchaseDocumentId);
    for (const r of rows) {
      m.set(r.documentId, BigInt(r.s ?? 0));
    }
    return m;
  }
}
