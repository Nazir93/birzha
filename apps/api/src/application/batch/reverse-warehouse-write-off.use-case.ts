import { loadBatchOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type {
  BatchWarehouseWriteOffLedger,
  BatchWarehouseWriteOffReason,
} from "../ports/batch-warehouse-write-off-ledger.port.js";
import { WarehouseWriteOffNotFoundError } from "../errors.js";
import { gramsToKg } from "../units/mass.js";
import type { RecordWarehouseWriteOffTransactionRunner } from "./record-warehouse-write-off.use-case.js";

const REASON: BatchWarehouseWriteOffReason = "quality_reject";

export class ReverseWarehouseWriteOffUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly ledger: BatchWarehouseWriteOffLedger,
    private readonly runInTransaction?: RecordWarehouseWriteOffTransactionRunner,
  ) {}

  async execute(writeOffId: string): Promise<void> {
    const id = writeOffId.trim();
    if (!id) {
      throw new WarehouseWriteOffNotFoundError(id);
    }

    const persist = async (batchRepo: BatchRepository, l: BatchWarehouseWriteOffLedger) => {
      const row = await l.findById(id);
      if (!row) {
        throw new WarehouseWriteOffNotFoundError(id);
      }
      if (row.reason !== REASON) {
        throw new Error(`unsupported_write_off_kind:${row.reason}`);
      }
      const batch = await loadBatchOrThrow(batchRepo, row.batchId);
      batch.reverseWarehouseWriteOff(gramsToKg(row.grams));
      await batchRepo.save(batch);
      const deleted = await l.deleteById(id);
      if (!deleted) {
        throw new WarehouseWriteOffNotFoundError(id);
      }
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.ledger);
    }
  }
}
