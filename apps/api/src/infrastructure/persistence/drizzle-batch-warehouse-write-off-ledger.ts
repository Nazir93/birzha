import { and, eq, inArray } from "drizzle-orm";

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
