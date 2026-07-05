import type { Batch } from "@birzha/domain";

/** Продано по партии в домене (граммы). */
export function batchSoldGrams(batch: Batch): bigint {
  return batch.toPersistenceState().soldGrams;
}

/** In-transit по партии в домене (граммы). */
export function batchInTransitGrams(batch: Batch): bigint {
  return batch.toPersistenceState().inTransitGrams;
}

/** Сходимость: sold в batch = сумма журнала продаж. */
export function assertBatchSoldMatchesJournal(batch: Batch, journalSoldGrams: bigint): void {
  const batchSold = batchSoldGrams(batch);
  if (batchSold !== journalSoldGrams) {
    throw new Error(
      `Расхождение sold: партия ${batch.getId()} batch=${batchSold.toString()} journal=${journalSoldGrams.toString()}`,
    );
  }
}

/** Сходимость отчёта рейса и партии после золотого сценария (один рейс). */
export function assertGoldenTripBatchReconcile(input: {
  batch: Batch;
  reportSoldGrams: bigint;
  reportShippedGrams: bigint;
  reportShortageGrams: bigint;
}): void {
  assertBatchSoldMatchesJournal(input.batch, input.reportSoldGrams);
  const processedKg = input.batch.totalProcessedKg();
  const expectedProcessedKg =
    Number(input.reportSoldGrams + input.reportShortageGrams) / 1000;
  if (Math.abs(processedKg - expectedProcessedKg) > 1e-6) {
    throw new Error(
      `processedKg ${processedKg} !== shipped-shortage ${expectedProcessedKg}`,
    );
  }
}
