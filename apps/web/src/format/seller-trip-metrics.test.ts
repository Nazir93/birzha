import { describe, expect, it } from "vitest";

import type { ShipmentReportResponse } from "../api/types.js";

import {
  aggregateSellerShipmentReports,
  clientSalePaymentLabelRu,
  filterTripsWithoutAssignedSeller,
  tripLedgerMetrics,
} from "./seller-trip-metrics.js";

const minimalReport = (id: string, tripNumber: string): ShipmentReportResponse => ({
  trip: { id, tripNumber, status: "open" },
  shipment: {
    totalGrams: "1000",
    totalPackageCount: "10",
    byBatch: [{ batchId: "b1", grams: "1000", packageCount: "10" }],
  },
  sales: {
    totalGrams: "400",
    totalPackageCount: "4",
    totalRevenueKopecks: "40000",
    totalCashKopecks: "25000",
    totalDebtKopecks: "15000",
    totalCardTransferKopecks: "0",
    retailGrams: "400",
    wholesaleGrams: "0",
    retailRevenueKopecks: "40000",
    wholesaleRevenueKopecks: "0",
    retailCashKopecks: "25000",
    retailDebtKopecks: "15000",
    retailCardTransferKopecks: "0",
    wholesaleCashKopecks: "0",
    wholesaleDebtKopecks: "0",
    wholesaleCardTransferKopecks: "0",
    byBatch: [
      {
        batchId: "b1",
        grams: "400",
        packageCount: "4",
        revenueKopecks: "40000",
        cashKopecks: "25000",
        debtKopecks: "15000",
        cardTransferKopecks: "0",
      },
    ],
    byClient: [],
  },
  shortage: { totalGrams: "0", byBatch: [] },
  financials: {
    revenueKopecks: "40000",
    costOfSoldKopecks: "0",
    costOfShortageKopecks: "0",
    grossProfitKopecks: "40000",
  },
});

describe("filterTripsWithoutAssignedSeller", () => {
  it("оставляет рейсы без assignedSellerUserId", () => {
    const trips = [
      { id: "1", assignedSellerUserId: undefined as string | undefined },
      { id: "2", assignedSellerUserId: null as string | null },
      { id: "3", assignedSellerUserId: "" },
      { id: "4", assignedSellerUserId: "u-1" },
      { id: "5", assignedSellerUserId: "   " },
    ];
    expect(filterTripsWithoutAssignedSeller(trips).map((t) => t.id)).toEqual(["1", "2", "3", "5"]);
  });
});

describe("tripLedgerMetrics", () => {
  it("считает остаток в пути по отчёту", () => {
    const r = minimalReport("t1", "Ф-1");
    const m = tripLedgerMetrics(r);
    expect(m.shippedKg).toBe(1000n);
    expect(m.soldKg).toBe(400n);
    expect(m.shortageKg).toBe(0n);
    expect(m.netTransitKg).toBe(600n);
    expect(m.revenueK).toBe(40000n);
    expect(m.cashK).toBe(25000n);
    expect(m.debtK).toBe(15000n);
  });
});

describe("aggregateSellerShipmentReports", () => {
  it("суммирует несколько отчётов", () => {
    const a = minimalReport("t1", "Ф-1");
    const b = minimalReport("t2", "Ф-2");
    b.shipment.totalGrams = "2000";
    b.shipment.byBatch = [{ batchId: "b2", grams: "2000", packageCount: "20" }];
    b.sales.totalGrams = "500";
    b.sales.totalPackageCount = "5";
    b.sales.totalRevenueKopecks = "50000";
    b.sales.retailGrams = "500";
    b.sales.wholesaleGrams = "0";
    b.sales.retailRevenueKopecks = "50000";
    b.sales.wholesaleRevenueKopecks = "0";
    b.sales.totalCashKopecks = "50000";
    b.sales.totalDebtKopecks = "0";
    b.sales.totalCardTransferKopecks = "0";
    b.sales.byBatch = [
      {
        batchId: "b2",
        grams: "500",
        packageCount: "5",
        revenueKopecks: "50000",
        cashKopecks: "50000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ];

    const tot = aggregateSellerShipmentReports([a, b]);
    expect(tot.shipped).toBe(3000n);
    expect(tot.sold).toBe(900n);
    expect(tot.soldPackages).toBe(9n);
    expect(tot.revenue).toBe(90000n);
    expect(tot.cash).toBe(75000n);
    expect(tot.debt).toBe(15000n);
    expect(tot.cardTransfer).toBe(0n);
    expect(tot.netTransit).toBe(tripLedgerMetrics(a).netTransitKg + tripLedgerMetrics(b).netTransitKg);
  });

  it("пустой список даёт нули", () => {
    expect(aggregateSellerShipmentReports([])).toEqual({
      shipped: 0n,
      sold: 0n,
      soldPackages: 0n,
      shortage: 0n,
      netTransit: 0n,
      revenue: 0n,
      cash: 0n,
      debt: 0n,
      cardTransfer: 0n,
    });
  });
});

describe("clientSalePaymentLabelRu", () => {
  it("классифицирует формы оплаты", () => {
    expect(clientSalePaymentLabelRu(0n, 0n)).toBe("—");
    expect(clientSalePaymentLabelRu(100n, 0n)).toBe("Наличные");
    expect(clientSalePaymentLabelRu(0n, 50n)).toBe("В долг");
    expect(clientSalePaymentLabelRu(30n, 70n)).toBe("Смешанно");
    expect(clientSalePaymentLabelRu(0n, 0n, 80n)).toBe("Перевод на карту");
    expect(clientSalePaymentLabelRu(40n, 0n, 60n)).toBe("Нал + карта");
    expect(clientSalePaymentLabelRu(0n, 10n, 90n)).toBe("Смешанно");
  });
});
