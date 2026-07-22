export type BatchWarehouseWriteOffReason = "quality_reject";

export type BatchWarehouseWriteOffAppend = {
  id: string;
  batchId: string;
  grams: bigint;
  reason: BatchWarehouseWriteOffReason;
  /**
   * true — возврат из отбора: кг не должны попасть в новую ПН.
   * false — возврат с рейса на склад: можно снова грузить.
   */
  blocksLoading: boolean;
};

export interface BatchWarehouseWriteOffLedger {
  append(row: BatchWarehouseWriteOffAppend): Promise<void>;
  findById(id: string): Promise<BatchWarehouseWriteOffAppend | null>;
  /** Последняя запись журнала возврата по партии (для идемпотентного ответа). */
  findLatestQualityRejectIdByBatchId(batchId: string): Promise<string | null>;
  deleteById(id: string): Promise<boolean>;
  /** Все записи quality_reject (лимит повторного возврата / история). */
  totalQualityRejectGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>>;
  /** Только записи с blocks_loading — вычитаются из строк ПН при создании. */
  totalBlockingLoadingGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>>;
  /** После создания ПН: снять блокировку, чтобы возвращённое снова можно было грузить. */
  clearBlocksLoadingByBatchIds(batchIds: string[]): Promise<void>;
  /** Повторный возврат из отбора при полном журнале: снова включить blocks_loading. */
  enableBlocksLoadingByBatchIds(batchIds: string[]): Promise<void>;
}
