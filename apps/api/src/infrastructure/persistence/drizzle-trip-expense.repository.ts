import { desc, eq, sql } from "drizzle-orm";

import type {
  TripExpenseAppend,
  TripExpenseCategory,
  TripExpenseRecord,
  TripExpenseRepository,
} from "../../application/ports/trip-expense-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { tripExpenses } from "../../db/schema.js";

function asCategory(raw: string): TripExpenseCategory {
  if (raw === "fuel" || raw === "road" || raw === "driver" || raw === "other") {
    return raw;
  }
  return "other";
}

function rowToRecord(r: typeof tripExpenses.$inferSelect): TripExpenseRecord {
  return {
    id: r.id,
    tripId: r.tripId,
    category: asCategory(r.category),
    amountKopecks: r.amountKopecks,
    expenseDate: r.expenseDate,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzleTripExpenseRepository implements TripExpenseRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: TripExpenseAppend): Promise<void> {
    await this.db.insert(tripExpenses).values({
      id: row.id,
      tripId: row.tripId,
      category: row.category,
      amountKopecks: row.amountKopecks,
      expenseDate: row.expenseDate,
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<TripExpenseRecord | null> {
    const rows = await this.db.select().from(tripExpenses).where(eq(tripExpenses.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(tripExpenses).where(eq(tripExpenses.id, id));
  }

  async listByTripId(tripId: string): Promise<TripExpenseRecord[]> {
    const rows = await this.db
      .select()
      .from(tripExpenses)
      .where(eq(tripExpenses.tripId, tripId))
      .orderBy(desc(tripExpenses.expenseDate), desc(tripExpenses.createdAt));
    return rows.map(rowToRecord);
  }

  async sumByTripId(tripId: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${tripExpenses.amountKopecks}), 0)` })
      .from(tripExpenses)
      .where(eq(tripExpenses.tripId, tripId));
    return BigInt(rows[0]?.s ?? 0);
  }
}
