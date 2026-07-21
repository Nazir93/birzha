import { Batch, gramsToKg, kgToGrams } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import { RecordWarehouseWriteOffUseCase } from "./record-warehouse-write-off.use-case.js";
import { ReverseWarehouseWriteOffUseCase } from "./reverse-warehouse-write-off.use-case.js";
import { WarehouseWriteOffNotFoundError } from "../errors.js";

describe("ReverseWarehouseWriteOffUseCase", () => {
  it("удаляет запись журнала без изменения остатка на складе", async () => {
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

  it("не трогает доменный writtenOff (недостача рейса) при отмене журнала", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const reverse = new ReverseWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w2",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    b.shipToTrip(40, "t1");
    b.writeOffFromTransit(10, "недостача");
    await batches.save(b);
    await ledger.append({
      id: "journal-row",
      batchId: "b-w2",
      grams: kgToGrams(5),
      reason: "quality_reject",
      blocksLoading: true,
    });
    await reverse.execute("journal-row");
    const reloaded = await batches.findById("b-w2");
    expect(gramsToKg(reloaded!.toPersistenceState().writtenOffGrams)).toBe(10);
    expect(gramsToKg(reloaded!.toPersistenceState().onWarehouseGrams)).toBe(60);
    const sums = await ledger.totalQualityRejectGramsByBatchIds(["b-w2"]);
    expect(sums.get("b-w2") ?? 0n).toBe(0n);
  });
});
