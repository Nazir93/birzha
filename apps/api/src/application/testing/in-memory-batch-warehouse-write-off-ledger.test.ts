import { describe, expect, it } from "vitest";

import { InMemoryBatchWarehouseWriteOffLedger } from "./in-memory-batch-warehouse-write-off-ledger.js";

describe("InMemoryBatchWarehouseWriteOffLedger.deleteQualityRejectByBatchIds", () => {
  it("удаляет все quality_reject по партиям после повторной погрузки", async () => {
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await ledger.append({
      id: "w1",
      batchId: "b1",
      grams: 5_000n,
      reason: "quality_reject",
      blocksLoading: true,
    });
    await ledger.append({
      id: "w2",
      batchId: "b2",
      grams: 2_000n,
      reason: "quality_reject",
      blocksLoading: false,
    });
    await ledger.append({
      id: "w3",
      batchId: "b1",
      grams: 1_000n,
      reason: "quality_reject",
      blocksLoading: false,
    });

    await ledger.deleteQualityRejectByBatchIds(["b1"]);

    expect(await ledger.findById("w1")).toBeNull();
    expect(await ledger.findById("w3")).toBeNull();
    expect(await ledger.findById("w2")).not.toBeNull();
    const left = await ledger.totalQualityRejectGramsByBatchIds(["b1", "b2"]);
    expect(left.get("b1")).toBeUndefined();
    expect(left.get("b2")).toBe(2_000n);
  });

  it("пустой список — no-op", async () => {
    const ledger = new InMemoryBatchWarehouseWriteOffLedger();
    await ledger.append({
      id: "w1",
      batchId: "b1",
      grams: 100n,
      reason: "quality_reject",
      blocksLoading: true,
    });
    await ledger.deleteQualityRejectByBatchIds([]);
    expect(await ledger.findById("w1")).not.toBeNull();
  });
});
