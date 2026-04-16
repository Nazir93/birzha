import type { BatchRepository } from "../ports/batch-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";

export type ReceiveOnWarehouseInput = {
  batchId: string;
  kg: number;
};

export class ReceiveOnWarehouseUseCase {
  constructor(private readonly batches: BatchRepository) {}

  async execute(input: ReceiveOnWarehouseInput): Promise<void> {
    const batch = await loadBatchOrThrow(this.batches, input.batchId);
    batch.receiveOnWarehouse(input.kg);
    await this.batches.save(batch);
  }
}
