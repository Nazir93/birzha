import { describe, expect, it } from "vitest";

import { InMemoryPurchaserExpenseRepository } from "../testing/in-memory-purchaser-expense.repository.js";

describe("InMemoryPurchaserExpenseRepository.sumByLoadingManifestIds", () => {
  it("суммирует только указанные ПН", async () => {
    const repo = new InMemoryPurchaserExpenseRepository();
    await repo.append({
      id: "a",
      expenseDate: new Date("2026-10-01T00:00:00.000Z"),
      category: "loading",
      amountKopecks: 1000n,
      loadingManifestId: "lm-1",
    });
    await repo.append({
      id: "b",
      expenseDate: new Date("2026-10-01T00:00:00.000Z"),
      category: "lunch",
      amountKopecks: 500n,
      loadingManifestId: "lm-1",
    });
    await repo.append({
      id: "c",
      expenseDate: new Date("2026-10-01T00:00:00.000Z"),
      category: "fuel",
      amountKopecks: 9000n,
      loadingManifestId: "lm-2",
    });

    expect(await repo.sumByLoadingManifestIds(["lm-1"])).toBe(1500n);
    expect(await repo.sumByLoadingManifestIds(["lm-1", "lm-2"])).toBe(10_500n);
    expect(await repo.sumByLoadingManifestIds([])).toBe(0n);
  });

  it("list по loadingManifestId отдаёт строки ПН", async () => {
    const repo = new InMemoryPurchaserExpenseRepository();
    await repo.append({
      id: "x",
      expenseDate: new Date("2026-09-15T00:00:00.000Z"),
      category: "foam",
      amountKopecks: 200n,
      loadingManifestId: "lm-x",
      comment: "пена",
    });
    const rows = await repo.list({ loadingManifestId: "lm-x" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountKopecks).toBe(200n);
    expect(rows[0]!.comment).toBe("пена");
  });
});
