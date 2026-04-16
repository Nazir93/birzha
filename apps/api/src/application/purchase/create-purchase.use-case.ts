import { Batch, type BatchDistribution } from "@birzha/domain";

import type { BatchRepository } from "../ports/batch-repository.port.js";

export type CreatePurchaseInput = {
  id: string;
  purchaseId: string;
  totalKg: number;
  pricePerKg: number;
  distribution: BatchDistribution;
};

export class CreatePurchaseUseCase {
  constructor(private readonly batches: BatchRepository) {}

  async execute(input: CreatePurchaseInput): Promise<void> {
    const batch = Batch.create({
      id: input.id,
      purchaseId: input.purchaseId,
      totalKg: input.totalKg,
      pricePerKg: input.pricePerKg,
      distribution: input.distribution,
    });
    await this.batches.save(batch);
  }
}
