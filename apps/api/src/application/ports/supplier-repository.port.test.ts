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

  it("без sortOrder назначает следующий порядковый номер", async () => {
    const repo = new InMemorySupplierRepository();
    const a = await repo.create("Альфа");
    const b = await repo.create("Бета");
    expect(a.sortOrder).toBe(1);
    expect(b.sortOrder).toBe(2);
    const c = await repo.create("Гамма", 10);
    expect(c.sortOrder).toBe(10);
    const d = await repo.create("Дельта");
    expect(d.sortOrder).toBe(11);
  });
});
