import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import type {
  SellerMoneySendAppend,
  SellerMoneySendListFilter,
  SellerMoneySendRecord,
  SellerMoneySendRepository,
} from "../../application/ports/seller-money-send-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { sellerMoneySends } from "../../db/schema.js";

function parseYmdUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function rowToRecord(r: typeof sellerMoneySends.$inferSelect): SellerMoneySendRecord {
  return {
    id: r.id,
    tripId: r.tripId,
    sendDate: r.sendDate,
    amountKopecks: r.amountKopecks,
    recipient: r.recipient,
    comment: r.comment,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt,
  };
}

export class DrizzleSellerMoneySendRepository implements SellerMoneySendRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: SellerMoneySendAppend): Promise<void> {
    await this.db.insert(sellerMoneySends).values({
      id: row.id,
      tripId: row.tripId?.trim() || null,
      sendDate: row.sendDate,
      amountKopecks: row.amountKopecks,
      recipient: row.recipient.trim(),
      comment: row.comment?.trim() || null,
      recordedByUserId: row.recordedByUserId?.trim() || null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async findById(id: string): Promise<SellerMoneySendRecord | null> {
    const rows = await this.db.select().from(sellerMoneySends).where(eq(sellerMoneySends.id, id));
    const r = rows[0];
    return r ? rowToRecord(r) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(sellerMoneySends).where(eq(sellerMoneySends.id, id));
  }

  async list(filter: SellerMoneySendListFilter): Promise<SellerMoneySendRecord[]> {
    const parts = [];
    if (filter.tripId) {
      parts.push(eq(sellerMoneySends.tripId, filter.tripId));
    }
    if (filter.recordedByUserId) {
      parts.push(eq(sellerMoneySends.recordedByUserId, filter.recordedByUserId));
    }
    if (filter.fromYmd) {
      parts.push(gte(sellerMoneySends.sendDate, parseYmdUtc(filter.fromYmd)));
    }
    if (filter.toYmd) {
      parts.push(lte(sellerMoneySends.sendDate, parseYmdUtc(filter.toYmd)));
    }
    const rows = await this.db
      .select()
      .from(sellerMoneySends)
      .where(parts.length > 0 ? and(...parts) : undefined)
      .orderBy(desc(sellerMoneySends.sendDate), desc(sellerMoneySends.createdAt));
    return rows.map(rowToRecord);
  }

  async sumInPeriod(fromYmd: string, toYmd: string): Promise<bigint> {
    const rows = await this.db
      .select({ s: sql<bigint>`coalesce(sum(${sellerMoneySends.amountKopecks}), 0)` })
      .from(sellerMoneySends)
      .where(
        and(
          gte(sellerMoneySends.sendDate, parseYmdUtc(fromYmd)),
          lte(sellerMoneySends.sendDate, parseYmdUtc(toYmd)),
        ),
      );
    return BigInt(rows[0]?.s ?? 0);
  }
}
