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
    arr.sort((a, b) => a.getId().localeCompare(b.getId()));
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    return arr.slice(offset, offset + limit);
  }

  async deleteById(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
