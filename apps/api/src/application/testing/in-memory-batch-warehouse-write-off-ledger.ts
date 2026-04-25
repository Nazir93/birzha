import type { BatchWarehouseWriteOffAppend } from "../ports/batch-warehouse-write-off-ledger.port.js";
import type { BatchWarehouseWriteOffLedger } from "../ports/batch-warehouse-write-off-ledger.port.js";

type Row = BatchWarehouseWriteOffAppend;

export class InMemoryBatchWarehouseWriteOffLedger implements BatchWarehouseWriteOffLedger {
  private readonly rows: Row[] = [];

  async append(row: BatchWarehouseWriteOffAppend): Promise<void> {
    this.rows.push({ ...row });
  }

  async totalQualityRejectGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>> {
    const set = new Set(batchIds);
    const m = new Map<string, bigint>();
    for (const r of this.rows) {
      if (r.reason !== "quality_reject" || !set.has(r.batchId)) {
        continue;
      }
      m.set(r.batchId, (m.get(r.batchId) ?? 0n) + r.grams);
    }
    return m;
  }
}
