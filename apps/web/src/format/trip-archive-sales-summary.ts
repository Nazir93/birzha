import type { ShipmentReportResponse } from "../api/types.js";

import { gramsToKgLabel, kopecksToRubLabel } from "./money.js";

/** Краткая подпись продаж для таблицы архива рейсов. */
export function formatTripArchiveSalesSoldKg(
  report: ShipmentReportResponse | undefined,
  loading: boolean,
): string {
  if (loading || !report) {
    return "…";
  }
  const g = report.sales.totalGrams?.trim();
  if (!g || g === "0") {
    return "0 кг";
  }
  return `${gramsToKgLabel(g)} кг`;
}

export function formatTripArchiveSalesRevenue(
  report: ShipmentReportResponse | undefined,
  loading: boolean,
): string {
  if (loading || !report) {
    return "…";
  }
  return `${kopecksToRubLabel(report.sales.totalRevenueKopecks)} ₽`;
}
