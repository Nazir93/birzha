import { describe, expect, it } from "vitest";

import { BatchNotFoundError } from "../errors.js";
import { CreatePurchaseUseCase } from "../purchase/create-purchase.use-case.js";
import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { ReceiveOnWarehouseUseCase } from "./receive-on-warehouse.use-case.js";

describe("ReceiveOnWarehouseUseCase", () => {
  it("переносит кг из ожидания на склад", async () => {
    const repo = new InMemoryBatchRepository();
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-1",
      purchaseId: "p-1",
      totalKg: 800,
      pricePerKg: 10,
      distribution: "awaiting_receipt",
    });

    await new ReceiveOnWarehouseUseCase(repo).execute({ batchId: "b-1", kg: 300 });

    const batch = await repo.findById("b-1");
    expect(batch).not.toBeNull();
    expect(batch!.remainingKg()).toBe(300);
  });

  it("если партии нет — BatchNotFoundError", async () => {
    const repo = new InMemoryBatchRepository();
    await expect(
      new ReceiveOnWarehouseUseCase(repo).execute({ batchId: "missing", kg: 1 }),
    ).rejects.toBeInstanceOf(BatchNotFoundError);
  });
});
