import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel } from "./batch-label.js";
import { maxSellablePackageCountForRowForSell, type TripBatchTableRow } from "./trip-report-rows.js";

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

/** Ключ группы (товар + калибр); для выбранной плитки продавца. */
export function sellerCaliberGroupKey(batch: BatchListItem | undefined, row: TripBatchTableRow): string {
  return caliberGroupKey(batch, row);
}

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

function lineLabelForRow(batch: BatchListItem | undefined): string {
  if (!batch) {
    return "партия без накладной";
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
      acc = { rows: [], lineLabel: lineLabelForRow(b) };
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

export function kgNumberToGramsBigInt(kg: number): bigint {
  if (!Number.isFinite(kg)) {
    return 0n;
  }
  return BigInt(Math.round(kg * 1000));
}

export function gramsBigIntToKgNumber(g: bigint): number {
  return Number(g) / 1000;
}

/** Раскладка продажи по граммам (как `kgToGrams` на API). */
export function allocateSellGramsAcrossTripRows(
  rows: TripBatchTableRow[],
  requestedGrams: bigint,
): { batchId: string; grams: bigint }[] {
  let remaining = requestedGrams;
  if (remaining <= 0n || rows.length === 0) {
    return [];
  }
  const sorted = rows.slice().sort((a, b) => {
    if (a.netTransitG < b.netTransitG) {
      return 1;
    }
    if (a.netTransitG > b.netTransitG) {
      return -1;
    }
    return a.batchId.localeCompare(b.batchId);
  });
  const out: { batchId: string; grams: bigint }[] = [];
  for (const row of sorted) {
    if (remaining <= 0n) {
      break;
    }
    if (row.netTransitG <= 0n) {
      continue;
    }
    const take = remaining < row.netTransitG ? remaining : row.netTransitG;
    out.push({ batchId: row.batchId, grams: take });
    remaining -= take;
  }
  return out;
}

/** Максимум «в машине» по выбранному калибру (группа или одна партия). */
export function maxSellableGramsForBatch(
  sellBatchId: string,
  sellableRows: TripBatchTableRow[],
  batchById: Map<string, BatchListItem>,
): bigint {
  const group = findSellerCaliberGroupForBatch(sellBatchId, sellableRows, batchById);
  if (group) {
    return group.totalNetG;
  }
  const row = sellableRows.find((r) => r.batchId === sellBatchId);
  return row?.netTransitG ?? 0n;
}

/** Максимум ящиков к продаже по выбранному калибру (сумма по партиям группы). */
export function maxSellablePackagesForBatch(
  sellBatchId: string,
  sellableRows: TripBatchTableRow[],
  batchById: Map<string, BatchListItem>,
): bigint {
  const group = findSellerCaliberGroupForBatch(sellBatchId, sellableRows, batchById);
  const rows = group?.rows ?? sellableRows.filter((r) => r.batchId === sellBatchId);
  let sum = 0n;
  for (const row of rows) {
    sum += maxSellablePackageCountForRowForSell(row, batchById.get(row.batchId));
  }
  return sum;
}

/** Группа, в которую входит выбранная партия (для продавца). */
export function findSellerCaliberGroupForBatch(
  sellBatchId: string,
  sellableRows: TripBatchTableRow[],
  batchById: Map<string, BatchListItem>,
): SellerCaliberGroup | undefined {
  if (!sellBatchId.trim()) {
    return undefined;
  }
  const groups = groupSellableRowsByCaliber(sellableRows, batchById);
  return groups.find((g) => g.rows.some((r) => r.batchId === sellBatchId));
}
