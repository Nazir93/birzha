import { compareProductGradeLineLabels } from "@birzha/contracts";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { salesCaliberAggregateKey, salesCaliberLineLabel, formatNakladLineLabel } from "./batch-label.js";

function bi(x: string | undefined): bigint {
  if (x === undefined || x === "") {
    return 0n;
  }
  return BigInt(x);
}

export type TripShipmentByCaliberRow = {
  lineLabel: string;
  grams: bigint;
  packages: bigint;
};

export type TripShipmentDetailRow = {
  batchId: string;
  lineNo: number;
  supplierName: string;
  documentNumber: string;
  caliberLabel: string;
  grams: bigint;
  packages: bigint;
};

/** Общая погрузочная по рейсу: одинаковые товар·калибр складываются. */
export function aggregateTripShipmentByCaliber(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
): TripShipmentByCaliberRow[] {
  const m = new Map<string, TripShipmentByCaliberRow>();
  for (const line of report.shipment.byBatch) {
    const g = bi(line.grams);
    if (g <= 0n) {
      continue;
    }
    const batch = batchById.get(line.batchId);
    const key = salesCaliberAggregateKey(batch, line.batchId);
    let row = m.get(key);
    if (!row) {
      row = {
        lineLabel: salesCaliberLineLabel(batch, key),
        grams: 0n,
        packages: 0n,
      };
      m.set(key, row);
    }
    row.grams += g;
    row.packages += bi(line.packageCount);
  }
  return [...m.values()].sort((a, b) => compareProductGradeLineLabels(a.lineLabel, b.lineLabel));
}

/** Подробная погрузочная по рейсу: одна строка на партию отгрузки. */
export function buildTripShipmentDetailRows(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
): TripShipmentDetailRow[] {
  const rows: TripShipmentDetailRow[] = [];
  for (const line of report.shipment.byBatch) {
    const g = bi(line.grams);
    if (g <= 0n) {
      continue;
    }
    const batch = batchById.get(line.batchId);
    const n = batch?.nakladnaya;
    const caliber = batch ? formatNakladLineLabel(batch) : "—";
    rows.push({
      batchId: line.batchId,
      lineNo: 0,
      supplierName: n?.supplierName?.trim() || "—",
      documentNumber: n?.documentNumber?.trim() || "—",
      caliberLabel: caliber === "—" ? "Товар · калибр не указан" : caliber,
      grams: g,
      packages: bi(line.packageCount),
    });
  }
  rows.sort((a, b) => {
    const byCaliber = compareProductGradeLineLabels(a.caliberLabel, b.caliberLabel);
    if (byCaliber !== 0) {
      return byCaliber;
    }
    return a.documentNumber.localeCompare(b.documentNumber, "ru") || a.batchId.localeCompare(b.batchId, "ru");
  });
  return rows.map((row, index) => ({ ...row, lineNo: index + 1 }));
}

