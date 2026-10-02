import { describe, expect, it } from "vitest";

import type { SellerFieldExpenseRecord } from "../ports/seller-field-expense-repository.port.js";

import { cashToHandOver, groupSellerFieldExpenses } from "./seller-field-expense-groups.js";

function row(partial: Partial<SellerFieldExpenseRecord> & { expenseDate: Date; amountKopecks: bigint }): SellerFieldExpenseRecord {
  return {
    id: partial.id ?? "e1",
    tripId: partial.tripId ?? "t1",
    expenseDate: partial.expenseDate,
    category: partial.category ?? "loader",
    amountKopecks: partial.amountKopecks,
    comment: null,
    recordedByUserId: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  };
}

describe("groupSellerFieldExpenses", () => {
  it("группирует по дням", () => {
    const groups = groupSellerFieldExpenses(
      [
        row({ expenseDate: new Date("2026-10-01T00:00:00.000Z"), amountKopecks: 1000n }),
        row({ id: "e2", expenseDate: new Date("2026-10-01T00:00:00.000Z"), amountKopecks: 500n }),
        row({ id: "e3", expenseDate: new Date("2026-10-02T00:00:00.000Z"), amountKopecks: 200n }),
      ],
      "day",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe("2026-10-02");
    expect(groups[1]!.totalKopecks).toBe(1500n);
    expect(groups[1]!.count).toBe(2);
  });

  it("группирует по месяцу", () => {
    const groups = groupSellerFieldExpenses(
      [
        row({ expenseDate: new Date("2026-10-01T00:00:00.000Z"), amountKopecks: 100n }),
        row({ id: "e2", expenseDate: new Date("2026-10-15T00:00:00.000Z"), amountKopecks: 50n }),
      ],
      "month",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("2026-10");
    expect(groups[0]!.totalKopecks).toBe(150n);
  });
});

describe("cashToHandOver", () => {
  it("нал минус траты", () => {
    expect(cashToHandOver(10_000n, 2500n)).toBe(7500n);
  });
});
