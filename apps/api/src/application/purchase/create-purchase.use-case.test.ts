import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { CreatePurchaseUseCase } from "./create-purchase.use-case.js";

describe("CreatePurchaseUseCase", () => {
  it("создаёт партию и сохраняет через репозиторий", async () => {
    const repo = new InMemoryBatchRepository();
    const uc = new CreatePurchaseUseCase(repo);

    await uc.execute({
      id: "batch-1",
      purchaseId: "purchase-1",
      totalKg: 1000,
      pricePerKg: 42,
      distribution: "on_hand",
    });

    const saved = await repo.findById("batch-1");
    expect(saved).not.toBeNull();
    expect(saved!.getPurchaseId()).toBe("purchase-1");
    expect(saved!.remainingKg()).toBe(1000);
  });
});
