import type { ShipmentReportResponse } from "../api/types.js";

/** Все batchId из отчёта рейса (отгрузка, продажи, недостача). */
export function batchIdsFromShipmentReport(report: ShipmentReportResponse): string[] {
  const ids = new Set<string>();
  for (const line of report.shipment.byBatch) {
    ids.add(line.batchId);
  }
  for (const line of report.sales.byBatch) {
    ids.add(line.batchId);
  }
  for (const line of report.salesForTripStock?.byBatch ?? []) {
    ids.add(line.batchId);
  }
  for (const line of report.shortage.byBatch) {
    ids.add(line.batchId);
  }
  return [...ids].sort();
}
