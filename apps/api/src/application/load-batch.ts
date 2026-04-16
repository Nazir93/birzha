import type { Batch } from "@birzha/domain";

import type { BatchRepository } from "./ports/batch-repository.port.js";
import { BatchNotFoundError } from "./errors.js";

export async function loadBatchOrThrow(
  batches: BatchRepository,
  batchId: string,
): Promise<Batch> {
  const batch = await batches.findById(batchId);
  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }
  return batch;
}
