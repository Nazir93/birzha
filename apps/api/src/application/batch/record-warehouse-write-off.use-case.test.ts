import { Batch, InsufficientStockError } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import { RecordWarehouseWriteOffUseCase } from "./record-warehouse-write-off.use-case.js";

describe("RecordWarehouseWriteOffUseCase", () => {
  it("списывает кг с остатка и пишет в журнал (quality_reject)", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const uc = new RecordWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w1",
      purchaseId: "p-1",
      totalKg: 200,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await batches.save(b);
    await uc.execute({ batchId: "b-w1", kg: 15, reason: "quality_reject" });
    const reloaded = await batches.findById("b-w1");
    expect(reloaded).not.toBeNull();
    expect(reloaded!.toPersistenceState().onWarehouseKg).toBe(185);
    const sums = await ledger.totalQualityRejectGramsByBatchIds(["b-w1"]);
    expect(sums.get("b-w1") ?? 0n).toBe(15_000n);
  });

  it("отказывает при слишком большой массе (остаток)", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const uc = new RecordWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w2",
      purchaseId: "p-1",
      totalKg: 50,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await batches.save(b);
    await expect(
      async () => await uc.execute({ batchId: "b-w2", kg: 100, reason: "quality_reject" }),
    ).rejects.toThrow(InsufficientStockError);
  });
});
