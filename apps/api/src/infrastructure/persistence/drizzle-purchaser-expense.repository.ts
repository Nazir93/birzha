import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import type {
  PurchaserExpenseAppend,
  PurchaserExpenseCategory,
  PurchaserExpenseListFilter,
  PurchaserExpenseRecord,
  PurchaserExpenseRepository,
} from "../../application/ports/purchaser-expense-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { purchaserExpenses } from "../../db/schema.js";

function asCategory(raw: string): PurchaserExpenseCategory {
  return raw === "salary" ? "salary" : "other";
}

function parseYmdUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function rowToRecord(r: typeof purchaserExpenses.$inferSelect): PurchaserExpenseRecord {
  return {
    id: r.id,
    expenseDate: r.expenseDate,
    category: asCategory(r.category),
    amountKopecks: r.amountKopecks,
    purchaserUserId: r.purchaserUserId,
    purchaserLabel: r.purchaserLabel,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzlePurchaserExpenseRepository implements PurchaserExpenseRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: PurchaserExpenseAppend): Promise<void> {
    await this.db.insert(purchaserExpenses).values({
      id: row.id,
      expenseDate: row.expenseDate,
      category: row.category,
      amountKopecks: row.amountKopecks,
      purchaserUserId: row.purchaserUserId?.trim() || null,
      purchaserLabel: row.purchaserLabel?.trim() || null,
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<PurchaserExpenseRecord | null> {
    const rows = await this.db.select().from(purchaserExpenses).where(eq(purchaserExpenses.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(purchaserExpenses).where(eq(purchaserExpenses.id, id));
  }

  async list(filter: PurchaserExpenseListFilter): Promise<PurchaserExpenseRecord[]> {
    const parts = [];
    if (filter.purchaserUserId) {
      parts.push(eq(purchaserExpenses.purchaserUserId, filter.purchaserUserId));
    }
    if (filter.fromYmd) {
      parts.push(gte(purchaserExpenses.expenseDate, parseYmdUtc(filter.fromYmd)));
    }
    if (filter.toYmd) {
      parts.push(lte(purchaserExpenses.expenseDate, parseYmdUtc(filter.toYmd)));
    }
    const rows = await this.db
      .select()
      .from(purchaserExpenses)
      .where(parts.length > 0 ? and(...parts) : undefined)
      .orderBy(desc(purchaserExpenses.expenseDate), desc(purchaserExpenses.createdAt));
    return rows.map(rowToRecord);
  }

  async sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${purchaserExpenses.amountKopecks}), 0)` })
      .from(purchaserExpenses)
      .where(
        and(
          gte(purchaserExpenses.expenseDate, parseYmdUtc(fromYmd)),
          lte(purchaserExpenses.expenseDate, parseYmdUtc(toYmd)),
        ),
      );
    return BigInt(rows[0]?.s ?? 0);
  }
}
