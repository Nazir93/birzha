import { describe, expect, it } from "vitest";

import { InMemorySupplierRepository } from "../../infrastructure/persistence/in-memory-supplier.repository.js";

describe("InMemorySupplierRepository", () => {
  it("создаёт и находит по имени без учёта регистра", async () => {
    const repo = new InMemorySupplierRepository();
    const created = await repo.create("Теплица Юг", 1);
    expect(created.isActive).toBe(true);
    const found = await repo.findActiveByName("  теплица юг ");
    expect(found?.id).toBe(created.id);
  });
});
