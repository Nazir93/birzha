import type { Batch } from "@birzha/domain";

import type { BatchRepository } from "../ports/batch-repository.port.js";

export class InMemoryBatchRepository implements BatchRepository {
  private readonly byId = new Map<string, Batch>();

  async save(batch: Batch): Promise<void> {
    this.byId.set(batch.getId(), batch);
  }

  async findById(id: string): Promise<Batch | null> {
    return this.byId.get(id) ?? null;
  }
}
