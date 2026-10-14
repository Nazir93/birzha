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

  async findLatestQualityRejectIdByBatchId(batchId: string): Promise<string | null> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i];
      if (row && row.batchId === batchId && row.reason === "quality_reject") {
        return row.id;
      }
    }
    return null;
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

  async totalBlockingLoadingGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>> {
    const set = new Set(batchIds);
    const m = new Map<string, bigint>();
    for (const r of this.rows) {
      if (r.reason !== "quality_reject" || !r.blocksLoading || !set.has(r.batchId)) {
        continue;
      }
      m.set(r.batchId, (m.get(r.batchId) ?? 0n) + r.grams);
    }
    return m;
  }

  async totalBlockingLoadingPackagesByBatchIds(batchIds: string[]): Promise<Map<string, number>> {
    const set = new Set(batchIds);
    const out = new Map<string, number>();
    const hasExplicit = new Set<string>();
    for (const r of this.rows) {
      if (r.reason !== "quality_reject" || !r.blocksLoading || !set.has(r.batchId)) {
        continue;
      }
      if (r.packageCount == null) {
        continue;
      }
      hasExplicit.add(r.batchId);
      const n = Number(r.packageCount);
      out.set(r.batchId, (out.get(r.batchId) ?? 0) + (Number.isFinite(n) && n > 0 ? Math.round(n) : 0));
    }
    for (const id of [...out.keys()]) {
      if (!hasExplicit.has(id)) {
        out.delete(id);
      }
    }
    return out;
  }

  async clearBlocksLoadingByBatchIds(batchIds: string[]): Promise<void> {
    const set = new Set(batchIds);
    for (const r of this.rows) {
      if (set.has(r.batchId) && r.blocksLoading) {
        r.blocksLoading = false;
      }
    }
  }

  async deleteQualityRejectByBatchIds(batchIds: string[]): Promise<void> {
    const set = new Set(batchIds);
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i];
      if (row && set.has(row.batchId) && row.reason === "quality_reject") {
        this.rows.splice(i, 1);
      }
    }
  }

  async enableBlocksLoadingByBatchIds(batchIds: string[]): Promise<void> {
    const set = new Set(batchIds);
    for (const r of this.rows) {
      if (set.has(r.batchId) && r.reason === "quality_reject" && !r.blocksLoading) {
        r.blocksLoading = true;
      }
    }
  }

  async enableBlocksLoadingUpToGrams(batchId: string, upToGrams: bigint): Promise<void> {
    if (upToGrams <= 0n) {
      return;
    }
    let need = upToGrams;
    for (const r of this.rows) {
      if (need <= 0n) {
        break;
      }
      if (r.batchId !== batchId || r.reason !== "quality_reject" || r.blocksLoading) {
        continue;
      }
      r.blocksLoading = true;
      need -= r.grams;
    }
  }
}
