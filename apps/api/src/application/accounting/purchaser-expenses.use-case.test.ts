import { describe, expect, it } from "vitest";

import { InMemoryPurchaserExpenseRepository } from "../testing/in-memory-purchaser-expense.repository.js";

import { PurchaserExpensesUseCase } from "./purchaser-expenses.use-case.js";

describe("PurchaserExpensesUseCase", () => {
  it("записывает зарплату и прочее и суммирует за период", async () => {
    const repo = new InMemoryPurchaserExpenseRepository();
    const uc = new PurchaserExpensesUseCase(repo);

    await uc.record({
      expenseDate: new Date("2026-10-05T00:00:00.000Z"),
      category: "salary",
      amountKopecks: 100_000n,
      purchaserLabel: "Иван",
    });
    await uc.record({
      expenseDate: new Date("2026-10-06T00:00:00.000Z"),
      category: "fuel",
      amountKopecks: 25_000n,
      purchaserLabel: "Иван",
      loadingManifestId: "lm-1",
      comment: "бензин",
      requireLoadingManifest: true,
    });

    const listed = await uc.list({ fromYmd: "2026-10-01", toYmd: "2026-10-31" });
    expect(listed.totalKopecks).toBe(125_000n);
    expect(listed.salaryKopecks).toBe(100_000n);
    expect(listed.otherKopecks).toBe(25_000n);
    expect(listed.expenses).toHaveLength(2);

    const sum = await repo.sumInPeriod("2026-10-01", "2026-10-31");
    expect(sum).toBe(125_000n);
  });

  it("удаляет расход", async () => {
    const repo = new InMemoryPurchaserExpenseRepository();
    const uc = new PurchaserExpensesUseCase(repo);
    const row = await uc.record({
      expenseDate: new Date("2026-10-05T00:00:00.000Z"),
      category: "salary",
      amountKopecks: 10_000n,
    });
    await uc.delete(row.id);
    const listed = await uc.list({});
    expect(listed.expenses).toHaveLength(0);
  });
});
