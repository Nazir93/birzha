import { describe, expect, it } from "vitest";

import {
  sellerExpensesDefaultDateRange,
  sellerExpensesListQueryParams,
} from "./seller-expenses-list-query.js";

describe("sellerExpensesListQueryParams", () => {
  it("при выбранном рейсе не шлёт from/to — все траты рейса как в отчёте", () => {
    const p = sellerExpensesListQueryParams({
      tripId: "t1",
      from: "2026-10-01",
      to: "2026-10-31",
      group: "day",
    });
    expect(p.get("tripId")).toBe("t1");
    expect(p.get("from")).toBeNull();
    expect(p.get("to")).toBeNull();
  });

  it("без рейса шлёт период", () => {
    const p = sellerExpensesListQueryParams({
      tripId: "",
      from: "2026-09-01",
      to: "2026-10-31",
      group: "week",
    });
    expect(p.get("from")).toBe("2026-09-01");
    expect(p.get("to")).toBe("2026-10-31");
    expect(p.get("group")).toBe("week");
  });
});

describe("sellerExpensesDefaultDateRange", () => {
  it("окно ~90 дней (локальный календарь)", () => {
    const r = sellerExpensesDefaultDateRange(new Date(2026, 9, 7));
    expect(r.to).toBe("2026-10-07");
    expect(r.from).toBe("2026-07-09");
  });
});
