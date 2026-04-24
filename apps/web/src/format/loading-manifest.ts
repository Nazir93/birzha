import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel } from "./batch-label.js";

/** Остаток в ящиках: доля onWarehouseKg к totalKg, × ящиков по строке накладной. */
export function estimatedPackageCountOnShelf(b: BatchListItem): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (b.totalKg <= 0) {
    return null;
  }
  return Math.max(0, Math.round((b.onWarehouseKg / b.totalKg) * linePk));
}

/**
 * Какие партии показывать в «листе на погрузку» при мультиселекте накладных.
 * @param documentOptionCount 0 — фильтр по накл. не задан (показать все строки); иначе только отмеченные documentId
 */
export function filterBatchesForLoadingManifest(
  batches: readonly BatchListItem[],
  documentOptionCount: number,
  selectedDocumentIds: ReadonlySet<string>,
): BatchListItem[] {
  return batches.filter((b) => {
    if (b.onWarehouseKg <= 0) {
      return false;
    }
    if (documentOptionCount === 0) {
      return true;
    }
    const docId = b.nakladnaya?.documentId;
    if (!docId) {
      return true;
    }
    return selectedDocumentIds.has(docId);
  });
}

export function sumLoadingManifestTotals(included: readonly BatchListItem[]): {
  kg: number;
  pkg: number;
  linesWithPkg: number;
  batchCount: number;
} {
  let kg = 0;
  let pkg = 0;
  let linesWithPkg = 0;
  for (const b of included) {
    kg += b.onWarehouseKg;
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      pkg += e;
      linesWithPkg += 1;
    }
  }
  return { kg, pkg, linesWithPkg, batchCount: included.length };
}

/** Суммы по калибру/товарной строке (как в подписи партии), для свода «сколько веса и ящ. по каждому калибру». */
export function aggregateBatchesByCaliberLine(batches: readonly BatchListItem[]): {
  lineLabel: string;
  totalKg: number;
  totalPkg: number;
  linesWithPkg: number;
  partCount: number;
}[] {
  const m = new Map<
    string,
    { lineLabel: string; totalKg: number; totalPkg: number; linesWithPkg: number; partCount: number }
  >();
  for (const b of batches) {
    const lineLabel = formatNakladLineLabel(b);
    if (!m.has(lineLabel)) {
      m.set(lineLabel, { lineLabel, totalKg: 0, totalPkg: 0, linesWithPkg: 0, partCount: 0 });
    }
    const g = m.get(lineLabel)!;
    g.totalKg += b.onWarehouseKg;
    g.partCount += 1;
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      g.totalPkg += e;
      g.linesWithPkg += 1;
    }
  }
  return Array.from(m.values()).sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
}
