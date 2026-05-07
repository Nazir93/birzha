import type { ShipmentReportResponse } from "../api/types.js";

import { aggregateTripBatchRows, buildTripBatchRows } from "./trip-report-rows.js";

/** Агрегаты по партиям для одного отчёта рейса (остаток в пути согласован с trip-report-rows). */
export function tripLedgerMetrics(r: ShipmentReportResponse) {
  const agg = aggregateTripBatchRows(buildTripBatchRows(r));
  return {
    shippedKg: agg.shippedG,
    soldKg: agg.soldG,
    shortageKg: agg.shortageG,
    netTransitKg: agg.netTransitG,
    revenueK: agg.revenueK,
    cashK: agg.cashK,
    debtK: agg.debtK,
  };
}

/** Итоги по всем загруженным отчётам закреплённых рейсов продавца. */
export type SellerShipmentTotals = {
  shipped: bigint;
  sold: bigint;
  shortage: bigint;
  netTransit: bigint;
  revenue: bigint;
  cash: bigint;
  debt: bigint;
};

export function aggregateSellerShipmentReports(reports: readonly ShipmentReportResponse[]): SellerShipmentTotals {
  let shipped = 0n;
  let sold = 0n;
  let shortage = 0n;
  let netTransit = 0n;
  let revenue = 0n;
  let cash = 0n;
  let debt = 0n;
  for (const r of reports) {
    shipped += BigInt(r.shipment.totalGrams);
    sold += BigInt(r.sales.totalGrams);
    shortage += BigInt(r.shortage.totalGrams);
    revenue += BigInt(r.sales.totalRevenueKopecks);
    cash += BigInt(r.sales.totalCashKopecks);
    debt += BigInt(r.sales.totalDebtKopecks);
    netTransit += tripLedgerMetrics(r).netTransitKg;
  }
  return { shipped, sold, shortage, netTransit, revenue, cash, debt };
}

/** Рейсы без закреплённого продавца — доступны для первичной привязки (повторно выбрать нельзя). */
export function filterTripsWithoutAssignedSeller<T extends { assignedSellerUserId?: string | null }>(
  trips: readonly T[],
): T[] {
  return trips.filter((t) => t.assignedSellerUserId == null || t.assignedSellerUserId === "");
}

/**
 * Классификация строки клиента по суммам нал / долг (копейки).
 */
export function clientSalePaymentLabelRu(cashKopecks: bigint, debtKopecks: bigint): "Наличные" | "В долг" | "Смешанно" | "—" {
  if (cashKopecks === 0n && debtKopecks === 0n) {
    return "—";
  }
  if (debtKopecks === 0n && cashKopecks > 0n) {
    return "Наличные";
  }
  if (cashKopecks === 0n && debtKopecks > 0n) {
    return "В долг";
  }
  return "Смешанно";
}
