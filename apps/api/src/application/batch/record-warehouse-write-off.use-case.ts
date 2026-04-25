import { randomUUID } from "node:crypto";

import { InvalidKgError } from "@birzha/domain";

import { loadBatchOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type {
  BatchWarehouseWriteOffAppend,
  BatchWarehouseWriteOffLedger,
  BatchWarehouseWriteOffReason,
} from "../ports/batch-warehouse-write-off-ledger.port.js";
import { kgToGrams } from "../units/kg-grams.js";

export type RecordWarehouseWriteOffInput = {
  batchId: string;
  /** Масса для списания; списывается с `on_warehouse_grams`, растут `written_off_grams` и запись в журнал. */
  kg: number;
  reason: BatchWarehouseWriteOffReason;
};

export type RecordWarehouseWriteOffTransactionRunner = (
  fn: (batches: BatchRepository, ledger: BatchWarehouseWriteOffLedger) => Promise<void>,
) => Promise<void>;

const REASON: BatchWarehouseWriteOffReason = "quality_reject";

export class RecordWarehouseWriteOffUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly ledger: BatchWarehouseWriteOffLedger,
    private readonly runInTransaction?: RecordWarehouseWriteOffTransactionRunner,
  ) {}

  async execute(input: RecordWarehouseWriteOffInput): Promise<void> {
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
      const batch = await loadBatchOrThrow(batches, input.batchId);
      batch.writeOff(input.kg, "quality_reject");
      await batches.save(batch);
      await l.append(row);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.ledger);
    }
  }
}
