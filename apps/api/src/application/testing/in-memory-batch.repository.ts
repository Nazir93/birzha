import type { Batch } from "@birzha/domain";

import type { BatchListFilter, BatchRepository } from "../ports/batch-repository.port.js";

export class InMemoryBatchRepository implements BatchRepository {
  private readonly byId = new Map<string, Batch>();

  async save(batch: Batch): Promise<void> {
    this.byId.set(batch.getId(), batch);
  }

  async findById(id: string): Promise<Batch | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdForUpdate(id: string): Promise<Batch | null> {
    return this.findById(id);
  }

  async list(filter?: BatchListFilter): Promise<Batch[]> {
    if (!filter) {
      return Array.from(this.byId.values()).sort((a, b) => a.getId().localeCompare(b.getId()));
    }

    if (filter.ids && filter.ids.length > 0) {
      const uniqueIds = [...new Set(filter.ids.map((id) => id.trim()).filter(Boolean))];
      return uniqueIds
        .map((id) => this.byId.get(id))
        .filter((b): b is Batch => b != null);
    }

    let arr = Array.from(this.byId.values());
    if (filter.search?.trim()) {
      const s = filter.search.trim().toLowerCase();
      arr = arr.filter((b) => b.getId().toLowerCase().includes(s));
    }
    if (filter.warehouseId?.trim()) {
      arr = arr.filter((b) => b.getWarehouseId() === filter.warehouseId!.trim());
    }
    if (filter.stockOnly) {
      arr = arr.filter((b) => b.toPersistenceState().onWarehouseGrams > 0n);
    }
    arr.sort((a, b) => a.getId().localeCompare(b.getId()));
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    return arr.slice(offset, offset + limit);
  }

  async count(filter?: Omit<BatchListFilter, "limit" | "offset" | "ids">): Promise<number> {
    if (!filter) {
      return this.byId.size;
    }

    let arr = Array.from(this.byId.values());
    if (filter.search?.trim()) {
      const s = filter.search.trim().toLowerCase();
      arr = arr.filter((b) => b.getId().toLowerCase().includes(s));
    }
    if (filter.warehouseId?.trim()) {
      arr = arr.filter((b) => b.getWarehouseId() === filter.warehouseId!.trim());
    }
    if (filter.stockOnly) {
      arr = arr.filter((b) => b.toPersistenceState().onWarehouseGrams > 0n);
    }
    return arr.length;
  }

  async deleteById(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
