export type BatchWarehouseWriteOffReason = "quality_reject";

export type BatchWarehouseWriteOffAppend = {
  id: string;
  batchId: string;
  grams: bigint;
  reason: BatchWarehouseWriteOffReason;
};

export interface BatchWarehouseWriteOffLedger {
  append(row: BatchWarehouseWriteOffAppend): Promise<void>;
  findById(id: string): Promise<BatchWarehouseWriteOffAppend | null>;
  deleteById(id: string): Promise<boolean>;
  totalQualityRejectGramsByBatchIds(batchIds: string[]): Promise<Map<string, bigint>>;
}
