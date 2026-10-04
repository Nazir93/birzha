import { and, desc, eq, sql } from "drizzle-orm";

import { calendarYmdFromDate, parseCalendarYmdUtcNoon } from "../../format/calendar-date.js";
import type {
  SellerFieldExpenseAppend,
  SellerFieldExpenseCategory,
  SellerFieldExpenseListFilter,
  SellerFieldExpenseRecord,
  SellerFieldExpenseRepository,
} from "../../application/ports/seller-field-expense-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { sellerFieldExpenses } from "../../db/schema.js";

function asCategory(raw: string): SellerFieldExpenseCategory {
  if (
    raw === "loader" ||
    raw === "lunch" ||
    raw === "pallets" ||
    raw === "rent" ||
    raw === "materials" ||
    raw === "other"
  ) {
    return raw;
  }
  return "other";
}

function rowToRecord(r: typeof sellerFieldExpenses.$inferSelect): SellerFieldExpenseRecord {
  return {
    id: r.id,
    tripId: r.tripId,
    expenseDate: parseCalendarYmdUtcNoon(calendarYmdFromDate(r.expenseDate)),
    category: asCategory(r.category),
    amountKopecks: r.amountKopecks,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzleSellerFieldExpenseRepository implements SellerFieldExpenseRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: SellerFieldExpenseAppend): Promise<void> {
    await this.db.insert(sellerFieldExpenses).values({
      id: row.id,
      tripId: row.tripId,
      expenseDate: parseCalendarYmdUtcNoon(calendarYmdFromDate(row.expenseDate)),
      category: row.category,
      amountKopecks: row.amountKopecks,
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<SellerFieldExpenseRecord | null> {
    const rows = await this.db.select().from(sellerFieldExpenses).where(eq(sellerFieldExpenses.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(sellerFieldExpenses).where(eq(sellerFieldExpenses.id, id));
  }

  async list(filter: SellerFieldExpenseListFilter): Promise<SellerFieldExpenseRecord[]> {
    const parts = [];
    if (filter.tripId) {
      parts.push(eq(sellerFieldExpenses.tripId, filter.tripId));
    }
    if (filter.recordedByUserId) {
      parts.push(eq(sellerFieldExpenses.recordedByUserId, filter.recordedByUserId));
    }
    if (filter.fromYmd) {
      parts.push(sql`${sellerFieldExpenses.expenseDate} >= CAST(${filter.fromYmd} AS date)`);
    }
    if (filter.toYmd) {
      parts.push(sql`${sellerFieldExpenses.expenseDate} <= CAST(${filter.toYmd} AS date)`);
    }
    const rows = await this.db
      .select()
      .from(sellerFieldExpenses)
      .where(parts.length > 0 ? and(...parts) : undefined)
      .orderBy(desc(sellerFieldExpenses.expenseDate), desc(sellerFieldExpenses.createdAt));
    return rows.map(rowToRecord);
  }

  async sumByTripId(tripId: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${sellerFieldExpenses.amountKopecks}), 0)` })
      .from(sellerFieldExpenses)
      .where(eq(sellerFieldExpenses.tripId, tripId));
    return BigInt(rows[0]?.s ?? 0);
  }
}
