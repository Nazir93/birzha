import { Batch, gramsToKg, InsufficientStockError } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryBatchWarehouseWriteOffLedger } from "../testing/in-memory-batch-warehouse-write-off-ledger.js";
import {
  maxWarehouseReturnGrams,
  RecordWarehouseWriteOffUseCase,
} from "./record-warehouse-write-off.use-case.js";

describe("maxWarehouseReturnGrams", () => {
  it("учитывает склад и рейс минус журнал", () => {
    expect(
      maxWarehouseReturnGrams({
        onWarehouseGrams: 10_000n,
        inTransitGrams: 5_000n,
        alreadyReturnedGrams: 3_000n,
      }),
    ).toBe(12_000n);
  });

  it("при полном журнале разрешает ремонт по inTransit", () => {
    expect(
      maxWarehouseReturnGrams({
        onWarehouseGrams: 0n,
        inTransitGrams: 15_950_000n,
        alreadyReturnedGrams: 15_950_000n,
      }),
    ).toBe(15_950_000n);
  });

  it("после полного возврата на складе — 0", () => {
    expect(
      maxWarehouseReturnGrams({
        onWarehouseGrams: 15_950_000n,
        inTransitGrams: 0n,
        alreadyReturnedGrams: 15_950_000n,
      }),
    ).toBe(0n);
  });
});

describe("RecordWarehouseWriteOffUseCase", () => {
  it("фиксирует возврат на склад в журнале без уменьшения onWarehouse", async () => {
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
    const { writeOffId } = await uc.execute({ batchId: "b-w1", kg: 15, reason: "quality_reject" });
    expect(writeOffId.length).toBeGreaterThan(0);
    const reloaded = await batches.findById("b-w1");
    expect(reloaded).not.toBeNull();
    expect(gramsToKg(reloaded!.toPersistenceState().onWarehouseGrams)).toBe(200);
    expect(gramsToKg(reloaded!.toPersistenceState().writtenOffGrams)).toBe(0);
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

  it("отказывает если сумма возвратов превысит остаток на складе", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    const uc = new RecordWarehouseWriteOffUseCase(batches, ledger);
    const b = Batch.create({
      id: "b-w3",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await batches.save(b);
    await uc.execute({ batchId: "b-w3", kg: 60, reason: "quality_reject" });
    await expect(
      async () => await uc.execute({ batchId: "b-w3", kg: 50, reason: "quality_reject" }),
    ).rejects.toThrow(InsufficientStockError);
  });

  it("позволяет возврат из рейса (inTransit) и пишет журнал после side-effect", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    let reducedGrams = 0n;
    const uc = new RecordWarehouseWriteOffUseCase(batches, ledger, async (fn) => {
      await fn(batches, ledger, {
        reduceActiveLoadingManifestLines: async (batchId, grams) => {
          reducedGrams = grams;
          const batch = await batches.findByIdForUpdate(batchId);
          expect(batch).not.toBeNull();
          batch!.receiveBack(gramsToKg(grams), "warehouse_return_adjust_loading_manifest");
          await batches.save(batch!);
        },
      });
    });
    const b = Batch.create({
      id: "b-transit",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    b.shipToTrip(100, "trip-1");
    await batches.save(b);
    expect(b.toPersistenceState().onWarehouseGrams).toBe(0n);
    expect(b.toPersistenceState().inTransitGrams).toBe(100_000n);

    const { writeOffId } = await uc.execute({
      batchId: "b-transit",
      kg: 100,
      reason: "quality_reject",
    });
    expect(writeOffId.length).toBeGreaterThan(0);
    expect(reducedGrams).toBe(100_000n);
    const reloaded = await batches.findById("b-transit");
    expect(gramsToKg(reloaded!.toPersistenceState().onWarehouseGrams)).toBe(100);
    expect(gramsToKg(reloaded!.toPersistenceState().inTransitGrams)).toBe(0);
    const sums = await ledger.totalQualityRejectGramsByBatchIds(["b-transit"]);
    expect(sums.get("b-transit") ?? 0n).toBe(100_000n);
  });

  it("при полном журнале и массе в рейсе — ремонт без второй записи в журнал", async () => {
    const batches = new InMemoryBatchRepository();
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await ledger.append({
      id: "wo-existing",
      batchId: "b-repair",
      grams: 100_000n,
      reason: "quality_reject",
    });
    const uc = new RecordWarehouseWriteOffUseCase(batches, ledger, async (fn) => {
      await fn(batches, ledger, {
        reduceActiveLoadingManifestLines: async (batchId, grams) => {
          const batch = await batches.findByIdForUpdate(batchId);
          expect(batch).not.toBeNull();
          batch!.receiveBack(gramsToKg(grams), "warehouse_return_adjust_loading_manifest");
          await batches.save(batch!);
        },
      });
    });
    const b = Batch.create({
      id: "b-repair",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    b.shipToTrip(100, "trip-1");
    await batches.save(b);

    const { writeOffId } = await uc.execute({
      batchId: "b-repair",
      kg: 100,
      reason: "quality_reject",
    });
    expect(writeOffId).toBe("wo-existing");
    const sums = await ledger.totalQualityRejectGramsByBatchIds(["b-repair"]);
    expect(sums.get("b-repair") ?? 0n).toBe(100_000n);
    const reloaded = await batches.findById("b-repair");
    expect(gramsToKg(reloaded!.toPersistenceState().onWarehouseGrams)).toBe(100);
    expect(gramsToKg(reloaded!.toPersistenceState().inTransitGrams)).toBe(0);
  });
});
