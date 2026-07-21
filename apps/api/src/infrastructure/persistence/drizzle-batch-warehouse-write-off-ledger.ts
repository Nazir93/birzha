import { and, desc, eq, inArray } from "drizzle-orm";

import type { BatchWarehouseWriteOffLedger, BatchWarehouseWriteOffAppend } from "../../application/ports/batch-warehouse-write-off-ledger.port.js";
import type { DbClient } from "../../db/client.js";
import { batchWarehouseWriteOffs } from "../../db/schema.js";

export class DrizzleBatchWarehouseWriteOffLedger implements BatchWarehouseWriteOffLedger {
  constructor(private readonly db: DbClient) {}

  async append(row: BatchWarehouseWriteOffAppend): Promise<void> {
    await this.db.insert(batchWarehouseWriteOffs).values({
      id: row.id,
      batchId: row.batchId,
      grams: row.grams,
      reason: row.reason,
    });
  }

  async findById(id: string): Promise<BatchWarehouseWriteOffAppend | null> {
    const [row] = await this.db
      .select({
        id: batchWarehouseWriteOffs.id,
        batchId: batchWarehouseWriteOffs.batchId,
        grams: batchWarehouseWriteOffs.grams,
        reason: batchWarehouseWriteOffs.reason,
      })
      .from(batchWarehouseWriteOffs)
      .where(eq(batchWarehouseWriteOffs.id, id))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      batchId: row.batchId,
      grams: row.grams,
      reason: row.reason as BatchWarehouseWriteOffAppend["reason"],
    };
  }

  async findLatestQualityRejectIdByBatchId(batchId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: batchWarehouseWriteOffs.id })
      .from(batchWarehouseWriteOffs)
      .where(
        and(
          eq(batchWarehouseWriteOffs.batchId, batchId),
          eq(batchWarehouseWriteOffs.reason, "quality_reject"),
        ),
      )
      .orderBy(desc(batchWarehouseWriteOffs.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(batchWarehouseWriteOffs)
      .where(eq(batchWarehouseWriteOffs.id, id))
      .returning({ id: batchWarehouseWriteOffs.id });
    return deleted.length > 0;
  }

  async totalQualityRejectGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>> {
    const m = new Map<string, bigint>();
    if (batchIds.length === 0) {
      return m;
    }
    const rows = await this.db
      .select({ batchId: batchWarehouseWriteOffs.batchId, grams: batchWarehouseWriteOffs.grams })
      .from(batchWarehouseWriteOffs)
      .where(
        and(
          inArray(batchWarehouseWriteOffs.batchId, batchIds),
          eq(batchWarehouseWriteOffs.reason, "quality_reject"),
        ),
      );
    for (const r of rows) {
      m.set(r.batchId, (m.get(r.batchId) ?? 0n) + r.grams);
    }
    return m;
  }
}
