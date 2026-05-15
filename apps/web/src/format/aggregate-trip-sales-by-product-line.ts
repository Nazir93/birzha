import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "./batch-label.js";

function bi(x: string | undefined): bigint {
  if (x === undefined || x === "") {
    return 0n;
  }
  return BigInt(x);
}

export type TripSalesByProductLineRow = {
  lineLabel: string;
  grams: bigint;
  revenue: bigint;
  cash: bigint;
  debt: bigint;
  card: bigint;
};

/** Схлопывание `sales.byBatch` по подписи товар·калибр из накладной (как в кабинете продавца). */
export function aggregateTripSalesByProductLine(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
): TripSalesByProductLineRow[] {
  const m = new Map<string, TripSalesByProductLineRow>();
  for (const s of report.sales.byBatch) {
    const g = bi(s.grams);
    if (g <= 0n) {
      continue;
    }
    const b = batchById.get(s.batchId);
    const lineLabel = b ? formatNakladLineLabel(b) : `партия ${formatShortBatchId(s.batchId)}`;
    let row = m.get(lineLabel);
    if (!row) {
      row = { lineLabel, grams: 0n, revenue: 0n, cash: 0n, debt: 0n, card: 0n };
      m.set(lineLabel, row);
    }
    row.grams += g;
    row.revenue += bi(s.revenueKopecks);
    row.cash += bi(s.cashKopecks);
    row.debt += bi(s.debtKopecks);
    row.card += bi(s.cardTransferKopecks ?? "0");
  }
  return [...m.values()].sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
}
