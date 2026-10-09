import { describe, expect, it } from "vitest";

import type { TripSaleLineJson } from "../api/types.js";
import {
  emptySaleCorrectionsCalcTotals,
  sumSelectedSaleCorrectionGroups,
} from "./seller-sale-corrections-calc.js";
import type { TripSaleLineCorrectionsGroup } from "./trip-sale-line-groups.js";

function line(partial: Partial<TripSaleLineJson> & Pick<TripSaleLineJson, "id">): TripSaleLineJson {
  return {
    tripId: "t1",
    batchId: "b1",
    saleId: `sale-${partial.id}`,
    kg: "10",
    packageCount: "2",
    pricePerKgKopecks: "10000",
    revenueKopecks: "100000",
    cashKopecks: "60000",
    debtKopecks: "10000",
    cardTransferKopecks: "30000",
    saleChannel: "retail",
    clientLabel: null,
    wholesaleBuyerId: null,
    recordedAt: "2026-10-08T12:00:00.000Z",
    ...partial,
  };
}

function group(
  key: string,
  lines: TripSaleLineJson[],
  revenue: bigint,
): TripSaleLineCorrectionsGroup {
  return {
    key,
    lines,
    lineLabel: "Калибр",
    totalKg: "10",
    totalPackages: "2",
    totalRevenueKopecks: revenue,
  };
}

describe("sumSelectedSaleCorrectionGroups", () => {
  it("пустой выбор — нули", () => {
    const groups = [group("a", [line({ id: "1" })], 100000n)];
    expect(sumSelectedSaleCorrectionGroups(groups, new Set())).toEqual(emptySaleCorrectionsCalcTotals());
  });

  it("складывает выбранные группы: кг, ящ, выручка, нал/карта/долг", () => {
    const g1 = group(
      "a",
      [line({ id: "1", kg: "10", packageCount: "2", cashKopecks: "60000", cardTransferKopecks: "30000", debtKopecks: "10000", revenueKopecks: "100000" })],
      100000n,
    );
    const g2 = group(
      "b",
      [
        line({ id: "2", kg: "5", packageCount: "1", cashKopecks: "20000", cardTransferKopecks: "0", debtKopecks: "0", revenueKopecks: "20000" }),
        line({ id: "3", kg: "5", packageCount: null, cashKopecks: "30000", cardTransferKopecks: "0", debtKopecks: "0", revenueKopecks: "30000" }),
      ],
      50000n,
    );
    const totals = sumSelectedSaleCorrectionGroups([g1, g2], new Set(["a", "b"]));
    expect(totals.selectedCount).toBe(2);
    expect(totals.grams).toBe(20000n);
    expect(totals.packages).toBe(3n);
    expect(totals.revenueKopecks).toBe(150000n);
    expect(totals.cashKopecks).toBe(110000n);
    expect(totals.cardKopecks).toBe(30000n);
    expect(totals.debtKopecks).toBe(10000n);
  });

  it("игнорирует невыбранные ключи", () => {
    const groups = [
      group("a", [line({ id: "1", cashKopecks: "100", revenueKopecks: "100" })], 100n),
      group("b", [line({ id: "2", cashKopecks: "200", revenueKopecks: "200" })], 200n),
    ];
    const totals = sumSelectedSaleCorrectionGroups(groups, new Set(["b"]));
    expect(totals.selectedCount).toBe(1);
    expect(totals.revenueKopecks).toBe(200n);
    expect(totals.cashKopecks).toBe(200n);
  });
});
