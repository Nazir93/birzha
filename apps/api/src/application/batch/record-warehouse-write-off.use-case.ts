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
  /**
   * Масса возврата на склад: фиксируется в журнале (onWarehouse не уменьшается),
   * снимает кг с активных ПН и при необходимости возвращает отгрузку с открытого рейса.
   */
  kg: number;
  reason: BatchWarehouseWriteOffReason;
};

export type RecordWarehouseWriteOffSideEffects = {
  reduceActiveLoadingManifestLines(batchId: string, grams: bigint): Promise<void>;
};

export type RecordWarehouseWriteOffTransactionRunner = (
  fn: (
    batches: BatchRepository,
    ledger: BatchWarehouseWriteOffLedger,
    sideEffects: RecordWarehouseWriteOffSideEffects,
  ) => Promise<void>,
) => Promise<void>;

const REASON: BatchWarehouseWriteOffReason = "quality_reject";

const NOOP_SIDE_EFFECTS: RecordWarehouseWriteOffSideEffects = {
  reduceActiveLoadingManifestLines: async () => {},
};

export type RecordWarehouseWriteOffResult = {
  writeOffId: string;
};

/**
 * Сколько кг ещё можно оформить как возврат: склад + в рейсе минус уже в журнале;
 * если журнал уже полный, но масса ещё в рейсе — разрешаем ремонт (снять с ПН/рейса).
 */
export function maxWarehouseReturnGrams(input: {
  onWarehouseGrams: bigint;
  inTransitGrams: bigint;
  alreadyReturnedGrams: bigint;
}): bigint {
  const physical = input.onWarehouseGrams + input.inTransitGrams;
  const leftover = physical - input.alreadyReturnedGrams;
  if (leftover > 0n) {
    return leftover;
  }
  if (input.inTransitGrams > 0n) {
    return input.inTransitGrams;
  }
  return 0n;
}

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

    let writeOffId: string = randomUUID();
    const persist = async (
      batches: BatchRepository,
      l: BatchWarehouseWriteOffLedger,
      sideEffects: RecordWarehouseWriteOffSideEffects = NOOP_SIDE_EFFECTS,
    ) => {
      const batch = await loadBatchForUpdateOrThrow(batches, input.batchId);
      const before = batch.toPersistenceState();
      const ledgerSums = await l.totalQualityRejectGramsByBatchIds([input.batchId]);
      const alreadyReturnedGrams = ledgerSums.get(input.batchId) ?? 0n;
      const availableGrams = maxWarehouseReturnGrams({
        onWarehouseGrams: before.onWarehouseGrams,
        inTransitGrams: before.inTransitGrams,
        alreadyReturnedGrams,
      });
      if (grams > availableGrams) {
        throw new InsufficientStockError("warehouse", availableGrams, grams);
      }

      // Сначала снимаем с ПН / рейса — иначе при inTransit лимит «только склад» ломает возврат.
      await sideEffects.reduceActiveLoadingManifestLines(input.batchId, grams);

      const after = (await loadBatchForUpdateOrThrow(batches, input.batchId)).toPersistenceState();
      const restoredPhysically =
        after.onWarehouseGrams > before.onWarehouseGrams ||
        after.inTransitGrams < before.inTransitGrams;
      /** Из отбора без снятия с рейса — блокирует новую ПН; с рейса на склад — можно грузить снова. */
      const blocksLoading = !restoredPhysically;

      const sumsAfter = await l.totalQualityRejectGramsByBatchIds([input.batchId]);
      const alreadyAfter = sumsAfter.get(input.batchId) ?? 0n;
      const roomForJournal = after.onWarehouseGrams - alreadyAfter;
      if (roomForJournal > 0n) {
        const toAppend = grams < roomForJournal ? grams : roomForJournal;
        const row: BatchWarehouseWriteOffAppend = {
          id: writeOffId,
          batchId: input.batchId,
          grams: toAppend,
          reason: REASON,
          blocksLoading,
        };
        await l.append(row);
        return;
      }

      const existingId = await l.findLatestQualityRejectIdByBatchId(input.batchId);
      if (existingId) {
        writeOffId = existingId;
        return;
      }
      throw new InsufficientStockError("warehouse", 0n, grams);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.ledger, NOOP_SIDE_EFFECTS);
    }
    return { writeOffId };
  }
}
