import { desc, eq, inArray, sql } from "drizzle-orm";

import type {
  DebtPaymentAppend,
  DebtPaymentMethod,
  DebtPaymentRecord,
  DebtPaymentRepository,
} from "../../application/ports/debt-payment-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { debtPayments } from "../../db/schema.js";

function asMethod(raw: string): DebtPaymentMethod {
  if (raw === "card" || raw === "bank") {
    return raw;
  }
  return "cash";
}

function rowToRecord(r: typeof debtPayments.$inferSelect): DebtPaymentRecord {
  return {
    id: r.id,
    saleId: r.saleId,
    tripId: r.tripId,
    counterpartyId: r.counterpartyId,
    clientLabel: r.clientLabel,
    amountKopecks: r.amountKopecks,
    method: asMethod(r.method),
    paidAt: r.paidAt,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzleDebtPaymentRepository implements DebtPaymentRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: DebtPaymentAppend): Promise<void> {
    await this.db.insert(debtPayments).values({
      id: row.id,
      saleId: row.saleId,
      tripId: row.tripId,
      counterpartyId: row.counterpartyId?.trim() || null,
      clientLabel: row.clientLabel?.trim() || null,
      amountKopecks: row.amountKopecks,
      method: row.method,
      paidAt: row.paidAt,
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<DebtPaymentRecord | null> {
    const rows = await this.db.select().from(debtPayments).where(eq(debtPayments.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(debtPayments).where(eq(debtPayments.id, id));
  }

  async listBySaleId(saleId: string): Promise<DebtPaymentRecord[]> {
    const rows = await this.db
      .select()
      .from(debtPayments)
      .where(eq(debtPayments.saleId, saleId))
      .orderBy(desc(debtPayments.paidAt), desc(debtPayments.createdAt));
    return rows.map(rowToRecord);
  }

  async sumPaidBySaleId(saleId: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${debtPayments.amountKopecks}), 0)` })
      .from(debtPayments)
      .where(eq(debtPayments.saleId, saleId));
    return BigInt(rows[0]?.s ?? 0);
  }

  async sumPaidByTripId(tripId: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${debtPayments.amountKopecks}), 0)` })
      .from(debtPayments)
      .where(eq(debtPayments.tripId, tripId));
    return BigInt(rows[0]?.s ?? 0);
  }

  async sumPaidBySaleIds(saleIds: string[]): Promise<Map<string, bigint>> {
    const m = new Map<string, bigint>();
    for (const id of saleIds) {
      m.set(id, 0n);
    }
    if (saleIds.length === 0) {
      return m;
    }
    const rows = await this.db
      .select({
        saleId: debtPayments.saleId,
        s: sql<bigint>`coalesce(sum(${debtPayments.amountKopecks}), 0)`,
      })
      .from(debtPayments)
      .where(inArray(debtPayments.saleId, saleIds))
      .groupBy(debtPayments.saleId);
    for (const r of rows) {
      m.set(r.saleId, BigInt(r.s ?? 0));
    }
    return m;
  }
}
