import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { salesCaliberAggregateKey, salesCaliberLineLabel } from "./batch-label.js";
import { salesBatchLinesForChannel, type SaleChannelFilter } from "./trip-sales-channel.js";

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

/** Схлопывание `sales.byBatch` по калибру (не по накладной/партии). */
export function aggregateTripSalesByProductLine(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
  channel: SaleChannelFilter = "all",
): TripSalesByProductLineRow[] {
  const m = new Map<string, TripSalesByProductLineRow>();
  for (const s of salesBatchLinesForChannel(report.sales, channel)) {
    const g = bi(s.grams);
    if (g <= 0n) {
      continue;
    }
    const b = batchById.get(s.batchId);
    const key = salesCaliberAggregateKey(b, s.batchId);
    let row = m.get(key);
    if (!row) {
      row = {
        lineLabel: salesCaliberLineLabel(b, key),
        grams: 0n,
        revenue: 0n,
        cash: 0n,
        debt: 0n,
        card: 0n,
      };
      m.set(key, row);
    }
    row.grams += g;
    row.revenue += bi(s.revenueKopecks);
    row.cash += bi(s.cashKopecks);
    row.debt += bi(s.debtKopecks);
    row.card += bi(s.cardTransferKopecks ?? "0");
  }
  return [...m.values()].sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
}
