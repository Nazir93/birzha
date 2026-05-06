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

/** Кг на складе по `allocation.destination`, без направления и отдельно в пути — для сводов в распределении и погрузке. */
export type AllocationShelfBreakdown = {
  assignedRows: { code: string; label: string; kg: number; batchCount: number }[];
  unassigned: { kg: number; batchCount: number };
  inTransit: { kg: number; batchCount: number };
};

export function summarizeAllocationBreakdown(
  batches: readonly BatchListItem[],
  destAllowed: readonly string[],
  labelDest: Record<string, string>,
): AllocationShelfBreakdown {
  const assignedMap = new Map<string, { kg: number; batchCount: number }>();
  let unKg = 0;
  let unBc = 0;
  let trKg = 0;
  let trBc = 0;

  for (const b of batches) {
    const ow = b.onWarehouseKg;
    if (ow > 0) {
      const d = b.allocation?.destination?.trim();
      if (!d) {
        unKg += ow;
        unBc += 1;
      } else {
        const cur = assignedMap.get(d) ?? { kg: 0, batchCount: 0 };
        cur.kg += ow;
        cur.batchCount += 1;
        assignedMap.set(d, cur);
      }
    }
    if (b.inTransitKg > 0) {
      trKg += b.inTransitKg;
      trBc += 1;
    }
  }

  const assignedRows: { code: string; label: string; kg: number; batchCount: number }[] = [];
  const consumed = new Set<string>();
  for (const code of destAllowed) {
    const v = assignedMap.get(code);
    if (v && v.kg > 0) {
      assignedRows.push({ code, label: labelDest[code] ?? code, kg: v.kg, batchCount: v.batchCount });
      consumed.add(code);
    }
  }
  const extras = [...assignedMap.entries()]
    .filter(([code, v]) => !consumed.has(code) && v.kg > 0)
    .map(([code, v]) => ({
      code,
      label: labelDest[code] ?? code,
      kg: v.kg,
      batchCount: v.batchCount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  assignedRows.push(...extras);

  return {
    assignedRows,
    unassigned: { kg: unKg, batchCount: unBc },
    inTransit: { kg: trKg, batchCount: trBc },
  };
}
