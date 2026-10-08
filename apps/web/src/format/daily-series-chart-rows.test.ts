import { describe, expect, it } from "vitest";

import {
  compactRubTick,
  dailyChartRows,
  dayAxisLabel,
  hasAnyDailyActivity,
} from "./daily-series-chart-rows.js";

describe("daily-series-chart-rows", () => {
  it("копейки → рубли, граммы → кг, подпись дня", () => {
    const rows = dailyChartRows([
      {
        day: "2026-10-02",
        revenueCashKopecks: "110000",
        revenueCardKopecks: "30050",
        revenueDebtKopecks: "0",
        revenueTotalKopecks: "140050",
        soldGrams: "15500",
        expensesKopecks: "700",
      },
    ]);
    expect(rows).toEqual([
      {
        day: "2026-10-02",
        label: "02.10",
        revenueRub: 1400.5,
        cashRub: 1100,
        cardRub: 300.5,
        debtRub: 0,
        expensesRub: 7,
        soldKg: 15.5,
      },
    ]);
  });

  it("hasAnyDailyActivity: ряд из нулей — пусто", () => {
    const zero = dailyChartRows([
      {
        day: "2026-10-01",
        revenueCashKopecks: "0",
        revenueCardKopecks: "0",
        revenueDebtKopecks: "0",
        revenueTotalKopecks: "0",
        soldGrams: "0",
        expensesKopecks: "0",
      },
    ]);
    expect(hasAnyDailyActivity(zero)).toBe(false);
    expect(hasAnyDailyActivity([{ ...zero[0]!, expensesRub: 1 }])).toBe(true);
  });

  it("compactRubTick и dayAxisLabel", () => {
    expect(compactRubTick(950)).toBe("950");
    expect(compactRubTick(12_500)).toBe("12,5 тыс");
    expect(compactRubTick(2_300_000)).toBe("2,3 млн");
    expect(dayAxisLabel("2026-01-09")).toBe("09.01");
    expect(dayAxisLabel("bad")).toBe("bad");
  });
});
