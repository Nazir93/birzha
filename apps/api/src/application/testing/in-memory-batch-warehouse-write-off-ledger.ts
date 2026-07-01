import type { BatchWarehouseWriteOffAppend } from "../ports/batch-warehouse-write-off-ledger.port.js";
import type { BatchWarehouseWriteOffLedger } from "../ports/batch-warehouse-write-off-ledger.port.js";

type Row = BatchWarehouseWriteOffAppend;

export class InMemoryBatchWarehouseWriteOffLedger implements BatchWarehouseWriteOffLedger {
  private readonly rows: Row[] = [];

  async append(row: BatchWarehouseWriteOffAppend): Promise<void> {
    this.rows.push({ ...row });
  }

  async findById(id: string): Promise<BatchWarehouseWriteOffAppend | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) {
      return false;
    }
    this.rows.splice(idx, 1);
    return true;
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
