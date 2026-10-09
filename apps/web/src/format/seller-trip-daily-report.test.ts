import { describe, expect, it } from "vitest";

import type {
  ShipmentReportResponse,
  TripDebtReceivableRow,
  TripFieldExpenseRow,
  TripSaleLineJson,
} from "../api/types.js";
import {
  aggregateSaleLinesToSalesBlock,
  buildDayScopedReport,
  calendarYmdFromIso,
  cashToHandOverForDay,
  expenseYmd,
  filterDebtReceivablesByDay,
  filterFieldExpensesByDay,
  listSellerTripReportDays,
} from "./seller-trip-daily-report.js";

function line(partial: Partial<TripSaleLineJson> & Pick<TripSaleLineJson, "id" | "recordedAt">): TripSaleLineJson {
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
    ...partial,
  };
}

function expense(partial: Partial<TripFieldExpenseRow> & Pick<TripFieldExpenseRow, "id" | "expenseDate">): TripFieldExpenseRow {
  return {
    tripId: "t1",
    category: "fuel",
    amountKopecks: "5000",
    comment: null,
    ...partial,
  };
}

function minimalReport(overrides: Partial<ShipmentReportResponse> = {}): ShipmentReportResponse {
  return {
    trip: {
      id: "t1",
      tripNumber: "Ф-1",
      status: "open",
      vehicleLabel: null,
      driverName: null,
      departedAt: null,
      assignedSellerUserId: null,
      destinationCode: null,
      destinationName: null,
      productGroup: null,
    },
    shipment: { totalGrams: "100000", totalPackageCount: "0", byBatch: [] },
    sales: {
      totalGrams: "0",
      totalPackageCount: "0",
      totalRevenueKopecks: "0",
      totalCashKopecks: "0",
      totalDebtKopecks: "0",
      totalCardTransferKopecks: "0",
      retailGrams: "0",
      wholesaleGrams: "0",
      retailRevenueKopecks: "0",
      wholesaleRevenueKopecks: "0",
      retailCashKopecks: "0",
      retailDebtKopecks: "0",
      retailCardTransferKopecks: "0",
      wholesaleCashKopecks: "0",
      wholesaleDebtKopecks: "0",
      wholesaleCardTransferKopecks: "0",
      byBatch: [],
      byClient: [],
      retailByBatch: [],
      wholesaleByBatch: [],
      retailByClient: [],
      wholesaleByClient: [],
    },
    shortage: { totalGrams: "0", byBatch: [] },
    financials: {
      revenueKopecks: "0",
      costOfSoldKopecks: "0",
      costOfShortageKopecks: "0",
      grossProfitKopecks: "0",
      fieldExpensesKopecks: "0",
      cashToHandOverKopecks: "0",
    },
    fieldExpenses: [],
    debtReceivables: [],
    ...overrides,
  };
}

describe("seller-trip-daily-report", () => {
  it("calendarYmdFromIso / expenseYmd: YYYY-MM-DD и ISO → локальный день", () => {
    expect(expenseYmd("2026-10-08")).toBe("2026-10-08");
    expect(calendarYmdFromIso("2026-10-08T15:30:00.000")).toBe("2026-10-08");
    expect(calendarYmdFromIso("")).toBe("");
  });

  it("listSellerTripReportDays: уникальные дни продаж и трат по возрастанию", () => {
    const days = listSellerTripReportDays({
      lines: [
        line({ id: "1", recordedAt: "2026-10-09T10:00:00.000Z" }),
        line({ id: "2", recordedAt: "2026-10-08T18:00:00.000Z" }),
      ],
      expenses: [expense({ id: "e1", expenseDate: "2026-10-08" }), expense({ id: "e2", expenseDate: "2026-10-10" })],
    });
    expect(days).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"].filter((d) => days.includes(d)));
    expect(days[0]! <= days[days.length - 1]!).toBe(true);
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain("2026-10-08");
    expect(days).toContain("2026-10-10");
  });

  it("aggregateSaleLinesToSalesBlock: розница и опт, кг→граммы", () => {
    const sales = aggregateSaleLinesToSalesBlock([
      line({
        id: "r",
        recordedAt: "2026-10-08T12:00:00.000Z",
        saleChannel: "retail",
        kg: "10",
        cashKopecks: "60000",
        cardTransferKopecks: "30000",
        debtKopecks: "10000",
        revenueKopecks: "100000",
      }),
      line({
        id: "w",
        recordedAt: "2026-10-08T13:00:00.000Z",
        saleChannel: "wholesale",
        batchId: "b2",
        kg: "5.5",
        packageCount: "1",
        cashKopecks: "0",
        cardTransferKopecks: "0",
        debtKopecks: "55000",
        revenueKopecks: "55000",
        clientLabel: "ИП Опт",
      }),
    ]);
    expect(sales.totalGrams).toBe("15500");
    expect(sales.retailGrams).toBe("10000");
    expect(sales.wholesaleGrams).toBe("5500");
    expect(sales.totalCashKopecks).toBe("60000");
    expect(sales.totalDebtKopecks).toBe("65000");
    expect(sales.wholesaleByClient).toHaveLength(1);
    expect(sales.wholesaleByClient?.[0]?.clientLabel).toBe("ИП Опт");
  });

  it("cashToHandOverForDay и пустой день в buildDayScopedReport", () => {
    expect(cashToHandOverForDay(100_000n, 15_000n)).toBe(85_000n);
    const full = minimalReport({
      fieldExpenses: [expense({ id: "e1", expenseDate: "2026-10-08", amountKopecks: "7000" })],
      debtReceivables: [
        {
          saleId: "s1",
          clientLabel: "Клиент",
          debtKopecks: "10000",
          paidKopecks: "0",
          remainingKopecks: "10000",
          status: "open",
          soldAt: "2026-10-08T12:00:00.000Z",
        } satisfies TripDebtReceivableRow,
      ],
      shortage: { totalGrams: "500", byBatch: [{ batchId: "b1", grams: "500" }] },
    });
    const lines = [
      line({ id: "1", recordedAt: "2026-10-08T12:00:00.000Z", cashKopecks: "50000", revenueKopecks: "50000", debtKopecks: "0", cardTransferKopecks: "0" }),
    ];
    const day = buildDayScopedReport(full, lines, "2026-10-08");
    expect(day.sales.totalCashKopecks).toBe("50000");
    expect(day.financials.fieldExpensesKopecks).toBe("7000");
    expect(day.financials.cashToHandOverKopecks).toBe("43000");
    expect(day.shortage.totalGrams).toBe("500");
    expect(day.fieldExpenses).toHaveLength(1);
    expect(day.debtReceivables).toHaveLength(1);

    const empty = buildDayScopedReport(full, lines, "2026-10-01");
    expect(empty.sales.totalGrams).toBe("0");
    expect(empty.fieldExpenses).toHaveLength(0);
    expect(empty.debtReceivables).toHaveLength(0);
    expect(empty.financials.cashToHandOverKopecks).toBe("0");
    expect(empty.shortage.totalGrams).toBe("500");

    expect(buildDayScopedReport(full, lines, null)).toBe(full);
  });

  it("filterFieldExpensesByDay / filterDebtReceivablesByDay", () => {
    const expenses = [
      expense({ id: "a", expenseDate: "2026-10-08" }),
      expense({ id: "b", expenseDate: "2026-10-09T00:00:00.000Z" }),
    ];
    expect(filterFieldExpensesByDay(expenses, "2026-10-08").map((e) => e.id)).toEqual(["a"]);
    expect(filterFieldExpensesByDay(expenses, null)).toHaveLength(2);

    const debts: TripDebtReceivableRow[] = [
      {
        saleId: "1",
        clientLabel: null,
        debtKopecks: "1",
        paidKopecks: "0",
        remainingKopecks: "1",
        status: "open",
        soldAt: "2026-10-08T10:00:00.000Z",
      },
      {
        saleId: "2",
        clientLabel: null,
        debtKopecks: "1",
        paidKopecks: "0",
        remainingKopecks: "1",
        status: "open",
        soldAt: "2026-10-09T10:00:00.000Z",
      },
    ];
    expect(filterDebtReceivablesByDay(debts, "2026-10-09").map((d) => d.saleId)).toEqual(["2"]);
  });
});
