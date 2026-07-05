import { Batch, gramsToKg, InsufficientStockError, kgToGrams } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import { RecordWarehouseWriteOffUseCase } from "./record-warehouse-write-off.use-case.js";
import { ReverseWarehouseWriteOffUseCase } from "./reverse-warehouse-write-off.use-case.js";
import { WarehouseWriteOffNotFoundError } from "../errors.js";

describe("ReverseWarehouseWriteOffUseCase", () => {
  it("возвращает кг на склад и удаляет запись журнала", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const record = new RecordWarehouseWriteOffUseCase(batches, ledger);
    const reverse = new ReverseWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w1",
      purchaseId: "p-1",
      totalKg: 200,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await batches.save(b);
    const { writeOffId } = await record.execute({ batchId: "b-w1", kg: 15, reason: "quality_reject" });
    await reverse.execute(writeOffId);
    const reloaded = await batches.findById("b-w1");
    expect(reloaded).not.toBeNull();
    expect(gramsToKg(reloaded!.toPersistenceState().onWarehouseGrams)).toBe(200);
    const sums = await ledger.totalQualityRejectGramsByBatchIds(["b-w1"]);
    expect(sums.get("b-w1") ?? 0n).toBe(0n);
  });

  it("404 если запись уже удалена", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const reverse = new ReverseWarehouseWriteOffUseCase(batches, ledger);
    await expect(reverse.execute("missing-id")).rejects.toThrow(WarehouseWriteOffNotFoundError);
  });

  it("отказывает если в партии недостаточно списанного кг", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const record = new RecordWarehouseWriteOffUseCase(batches, ledger);
    const reverse = new ReverseWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w2",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await batches.save(b);
    const { writeOffId } = await record.execute({ batchId: "b-w2", kg: 10, reason: "quality_reject" });
    const reloaded = await batches.findById("b-w2");
    const state = reloaded!.toPersistenceState();
    await batches.save(
      Batch.restoreFromPersistence({
        ...state,
        writtenOffGrams: kgToGrams(5),
        onWarehouseGrams: state.onWarehouseGrams + kgToGrams(5),
      }),
    );
    await expect(reverse.execute(writeOffId)).rejects.toThrow(InsufficientStockError);
  });
});
