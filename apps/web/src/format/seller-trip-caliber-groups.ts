import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "./batch-label.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";

/** Одна строка списка «калибр на рейсе» для продавца (может объединять несколько партий). */
export type SellerCaliberGroup = {
  /** Подпись: товар · калибр (без номера накладной). */
  lineLabel: string;
  /** Сумма «в машине» по всем партиям группы. */
  totalNetG: bigint;
  rows: TripBatchTableRow[];
  /** Партия, с которой списывается текущая сделка (максимальный остаток в группе). */
  primaryBatchId: string;
  primaryRow: TripBatchTableRow;
};

function caliberGroupKey(batch: BatchListItem | undefined, row: TripBatchTableRow): string {
  if (!batch) {
    return `__id:${row.batchId}`;
  }
  const g = batch.nakladnaya?.productGroup?.trim() ?? "";
  const c = batch.nakladnaya?.productGradeCode?.trim() ?? "";
  if (!g && !c) {
    return `__id:${row.batchId}`;
  }
  return `\0${g}\0${c}`;
}

function lineLabelForRow(batch: BatchListItem | undefined, row: TripBatchTableRow): string {
  if (!batch) {
    return `партия ${formatShortBatchId(row.batchId)}`;
  }
  return formatNakladLineLabel(batch);
}

/**
 * Схлопывает строки отчёта по одному калибру (товар + код калибра из накладной);
 * партии без вида/калибра остаются по одной на `batchId`.
 */
export function groupSellableRowsByCaliber(
  sellableRows: TripBatchTableRow[],
  batchById: Map<string, BatchListItem>,
): SellerCaliberGroup[] {
  type Acc = { rows: TripBatchTableRow[]; lineLabel: string };
  const m = new Map<string, Acc>();
  for (const row of sellableRows) {
    const b = batchById.get(row.batchId);
    const key = caliberGroupKey(b, row);
    let acc = m.get(key);
    if (!acc) {
      acc = { rows: [], lineLabel: lineLabelForRow(b, row) };
      m.set(key, acc);
    }
    acc.rows.push(row);
  }

  const out: SellerCaliberGroup[] = [];
  for (const acc of m.values()) {
    const rows = acc.rows.slice();
    let totalNetG = 0n;
    for (const r of rows) {
      totalNetG += r.netTransitG;
    }
    rows.sort((a, b) => {
      if (a.netTransitG < b.netTransitG) {
        return 1;
      }
      if (a.netTransitG > b.netTransitG) {
        return -1;
      }
      return a.batchId.localeCompare(b.batchId);
    });
    const primaryRow = rows[0]!;
    out.push({
      lineLabel: acc.lineLabel,
      totalNetG,
      rows,
      primaryBatchId: primaryRow.batchId,
      primaryRow,
    });
  }
  out.sort((a, b) => {
    const c = a.lineLabel.localeCompare(b.lineLabel, "ru");
    if (c !== 0) {
      return c;
    }
    return a.primaryBatchId.localeCompare(b.primaryBatchId);
  });
  return out;
}

export function formatSellerCaliberGroupOptionLabel(
  g: SellerCaliberGroup,
  kgFromGrams: (grams: bigint) => string,
): string {
  const kg = kgFromGrams(g.totalNetG);
  if (g.rows.length <= 1) {
    return `${g.lineLabel} · ${kg} кг`;
  }
  return `${g.lineLabel} · ${kg} кг · ${g.rows.length} партии`;
}
