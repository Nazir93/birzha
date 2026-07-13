import { randomUUID } from "node:crypto";

import { InsufficientStockError, InvalidKgError } from "@birzha/domain";

import { loadBatchForUpdateOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type {
  BatchWarehouseWriteOffAppend,
  BatchWarehouseWriteOffLedger,
  BatchWarehouseWriteOffReason,
} from "../ports/batch-warehouse-write-off-ledger.port.js";
import { kgToGrams } from "../units/mass.js";

export type RecordWarehouseWriteOffInput = {
  batchId: string;
  /** Масса возврата на склад; фиксируется в журнале, остаток на складе не уменьшается. */
  kg: number;
  reason: BatchWarehouseWriteOffReason;
};

export type RecordWarehouseWriteOffTransactionRunner = (
  fn: (batches: BatchRepository, ledger: BatchWarehouseWriteOffLedger) => Promise<void>,
) => Promise<void>;

const REASON: BatchWarehouseWriteOffReason = "quality_reject";

export type RecordWarehouseWriteOffResult = {
  writeOffId: string;
};

export class RecordWarehouseWriteOffUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly ledger: BatchWarehouseWriteOffLedger,
    private readonly runInTransaction?: RecordWarehouseWriteOffTransactionRunner,
  ) {}

  async execute(input: RecordWarehouseWriteOffInput): Promise<RecordWarehouseWriteOffResult> {
    if (input.reason !== REASON) {
      throw new Error(`unsupported_write_off_kind:${input.reason}`);
    }
    if (!Number.isFinite(input.kg) || input.kg <= 0) {
      throw new InvalidKgError("kg", input.kg);
    }
    const grams = kgToGrams(input.kg);
    if (grams <= 0n) {
      throw new InvalidKgError("kg", input.kg);
    }

    const id = randomUUID();
    const row: BatchWarehouseWriteOffAppend = { id, batchId: input.batchId, grams, reason: REASON };
    const persist = async (batches: BatchRepository, l: BatchWarehouseWriteOffLedger) => {
      const batch = await loadBatchForUpdateOrThrow(batches, input.batchId);
      const onWarehouseGrams = batch.toPersistenceState().onWarehouseGrams;
      const ledgerSums = await l.totalQualityRejectGramsByBatchIds([input.batchId]);
      const alreadyReturnedGrams = ledgerSums.get(input.batchId) ?? 0n;
      const availableGrams = onWarehouseGrams - alreadyReturnedGrams;
      if (grams > availableGrams) {
        throw new InsufficientStockError("warehouse", availableGrams, grams);
      }
      await l.append(row);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.ledger);
    }
    return { writeOffId: id };
  }
}
