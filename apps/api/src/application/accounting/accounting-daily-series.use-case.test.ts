import { Trip } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryPurchaserExpenseRepository } from "../testing/in-memory-purchaser-expense.repository.js";
import { InMemorySellerFieldExpenseRepository } from "../testing/in-memory-seller-field-expense.repository.js";
import { InMemoryTripExpenseRepository } from "../testing/in-memory-trip-expense.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import {
  ACCOUNTING_DAILY_MAX_DAYS,
  AccountingDailySeriesUseCase,
  clampDailyRange,
  enumerateYmdRange,
} from "./accounting-daily-series.use-case.js";

function noonUtc(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

async function setup() {
  const trips = new InMemoryTripRepository();
  const sales = new InMemoryTripSaleRepository();
  const tripExpenses = new InMemoryTripExpenseRepository();
  const fieldExpenses = new InMemorySellerFieldExpenseRepository();
  const purchaserExpenses = new InMemoryPurchaserExpenseRepository();

  await trips.save(Trip.create({ id: "t-msk", tripNumber: "01", destinationCode: "moscow" }));
  await trips.save(Trip.create({ id: "t-spb", tripNumber: "02", destinationCode: "spb" }));

  await sales.append({
    id: "s1",
    tripId: "t-msk",
    batchId: "b1",
    saleId: "sale-1",
    grams: 10_000n,
    pricePerKgKopecks: 10_000n,
    revenueKopecks: 100_000n,
    cashKopecks: 60_000n,
    debtKopecks: 10_000n,
    cardTransferKopecks: 30_000n,
    saleChannel: "retail",
    recordedAt: noonUtc("2026-10-02"),
  });
  await sales.append({
    id: "s2",
    tripId: "t-spb",
    batchId: "b2",
    saleId: "sale-2",
    grams: 5_000n,
    pricePerKgKopecks: 10_000n,
    revenueKopecks: 50_000n,
    cashKopecks: 50_000n,
    debtKopecks: 0n,
    cardTransferKopecks: 0n,
    saleChannel: "wholesale",
    recordedAt: noonUtc("2026-10-02"),
  });
  // Вне периода — не попадает
  await sales.append({
    id: "s3",
    tripId: "t-msk",
    batchId: "b1",
    saleId: "sale-3",
    grams: 1_000n,
    pricePerKgKopecks: 10_000n,
    revenueKopecks: 10_000n,
    cashKopecks: 10_000n,
    debtKopecks: 0n,
    cardTransferKopecks: 0n,
    saleChannel: "retail",
    recordedAt: noonUtc("2026-09-30"),
  });

  await tripExpenses.append({
    id: "te1",
    tripId: "t-msk",
    category: "fuel",
    amountKopecks: 5_000n,
    expenseDate: noonUtc("2026-10-01"),
  });
  await fieldExpenses.append({
    id: "fe1",
    tripId: "t-spb",
    category: "loader",
    amountKopecks: 2_000n,
    expenseDate: noonUtc("2026-10-03"),
  });
  await purchaserExpenses.append({
    id: "pe1",
    category: "lunch",
    amountKopecks: 700n,
    expenseDate: noonUtc("2026-10-03"),
  });

  return new AccountingDailySeriesUseCase(sales, trips, tripExpenses, fieldExpenses, purchaserExpenses);
}

describe("AccountingDailySeriesUseCase", () => {
  it("раскладывает кассу, массу и расходы по дням; дни без операций — нули", async () => {
    const uc = await setup();
    const res = await uc.execute({ fromYmd: "2026-10-01", toYmd: "2026-10-03" });

    expect(res.days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);

    const [d1, d2, d3] = res.days;
    expect(d1).toMatchObject({ revenueTotalKopecks: "0", soldGrams: "0", expensesKopecks: "5000" });
    expect(d2).toMatchObject({
      revenueCashKopecks: "110000",
      revenueCardKopecks: "30000",
      revenueDebtKopecks: "10000",
      revenueTotalKopecks: "150000",
      soldGrams: "15000",
      expensesKopecks: "0",
    });
    // полевые продавца 2000 + закупщика 700
    expect(d3).toMatchObject({ revenueTotalKopecks: "0", expensesKopecks: "2700" });
  });

  it("выборка по региону: только рейсы региона, расходы закупщика не учитываются", async () => {
    const uc = await setup();
    const res = await uc.execute({ fromYmd: "2026-10-01", toYmd: "2026-10-03", destinationCode: "spb" });

    const [d1, d2, d3] = res.days;
    expect(d1.expensesKopecks).toBe("0");
    expect(d2).toMatchObject({ revenueTotalKopecks: "50000", soldGrams: "5000" });
    expect(d3.expensesKopecks).toBe("2000");
  });

  it("выборка по рейсу", async () => {
    const uc = await setup();
    const res = await uc.execute({ fromYmd: "2026-10-01", toYmd: "2026-10-03", tripId: "t-msk" });
    expect(res.days[0].expensesKopecks).toBe("5000");
    expect(res.days[1].revenueTotalKopecks).toBe("100000");
    expect(res.days[2].expensesKopecks).toBe("0");
  });

  it("enumerateYmdRange / clampDailyRange: непрерывный ряд, длинный период обрезается от конца", () => {
    expect(enumerateYmdRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    const clamped = clampDailyRange("2020-01-01", "2026-10-08");
    expect(clamped.toYmd).toBe("2026-10-08");
    expect(enumerateYmdRange(clamped.fromYmd, clamped.toYmd)).toHaveLength(ACCOUNTING_DAILY_MAX_DAYS);
    expect(clampDailyRange("2026-10-01", "2026-10-08")).toEqual({ fromYmd: "2026-10-01", toYmd: "2026-10-08" });
  });
});
