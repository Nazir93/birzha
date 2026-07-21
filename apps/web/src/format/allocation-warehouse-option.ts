import type { BatchListItem } from "../api/types.js";
import { batchAvailableForLoadingKg } from "./batch-available-for-loading.js";

export type AllocationWarehouseOption = {
  id: string;
  /** Партии, доступные для нового отбора (не в активных ПН). */
  batchCount: number;
  /** Кг, доступные для нового отбора (минус резерв в активных ПН). */
  totalKg: number;
  packageEstimate: number;
  linesWithBoxData: number;
  /** Весь физический остаток на складе (включая зарезервированный в активных ПН). */
  totalKgOnWarehouse: number;
  totalBatchCountOnWarehouse: number;
  totalPackageEstimateOnWarehouse: number;
  totalLinesWithBoxDataOnWarehouse: number;
  reservedBatchCount: number;
  reservedKg: number;
};

type WarehouseCatalogRow = { id: string; name: string };

function sumPhysicalOnWarehouseKg(batches: BatchListItem[]): number {
  return batches.reduce((a, b) => a + b.onWarehouseKg, 0);
}

function sumAvailableForLoadingKg(batches: BatchListItem[]): number {
  return batches.reduce((a, b) => a + batchAvailableForLoadingKg(b), 0);
}

/** Сводка по складам для выпадающего списка «Погрузка на машину». */
export function buildAllocationWarehouseOptions(input: {
  warehouseCatalog: readonly WarehouseCatalogRow[];
  availableByWarehouse: ReadonlyMap<string, BatchListItem[]>;
  eligibleByWarehouse: ReadonlyMap<string, BatchListItem[]>;
  extraWarehouseOrder: readonly string[];
  reservedBatchIds: ReadonlySet<string>;
  sumPackageEstimatesForWarehouse: (batches: BatchListItem[]) => { sum: number; linesWithBoxData: number };
}): AllocationWarehouseOption[] {
  const out: AllocationWarehouseOption[] = [];
  const cat = input.warehouseCatalog.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const add = (id: string) => {
    const availableBs = input.availableByWarehouse.get(id) ?? [];
    const allBs = input.eligibleByWarehouse.get(id) ?? [];
    const reservedBs = allBs.filter((b) => input.reservedBatchIds.has(b.id));
    const availablePkg = input.sumPackageEstimatesForWarehouse(availableBs);
    const totalPkg = input.sumPackageEstimatesForWarehouse(allBs);
    out.push({
      id,
      batchCount: availableBs.length,
      totalKg: sumAvailableForLoadingKg(availableBs),
      packageEstimate: availablePkg.sum,
      linesWithBoxData: availablePkg.linesWithBoxData,
      totalKgOnWarehouse: sumPhysicalOnWarehouseKg(allBs),
      totalBatchCountOnWarehouse: allBs.length,
      totalPackageEstimateOnWarehouse: totalPkg.sum,
      totalLinesWithBoxDataOnWarehouse: totalPkg.linesWithBoxData,
      reservedBatchCount: reservedBs.length,
      reservedKg: sumPhysicalOnWarehouseKg(reservedBs),
    });
  };

  for (const w of cat) {
    add(w.id);
  }
  for (const id of input.extraWarehouseOrder) {
    if (cat.some((w) => w.id === id)) {
      continue;
    }
    add(id);
  }
  return out;
}

/** Подпись склада в select: полный остаток + пометка резерва ПН. */
export function formatAllocationWarehouseSelectLabel(
  warehouseName: string,
  row: AllocationWarehouseOption,
): string {
  const kg = row.totalKgOnWarehouse.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const parts = [`${warehouseName} — ${kg} кг`];
  if (row.totalLinesWithBoxDataOnWarehouse > 0) {
    parts.push(`≈ ${row.totalPackageEstimateOnWarehouse.toLocaleString("ru-RU")} ящ.`);
  }
  parts.push(`${row.totalBatchCountOnWarehouse} парт.`);
  let label = parts.join(", ");
  if (row.reservedBatchCount > 0 && row.batchCount === 0) {
    label += " · в резерве ПН";
  } else if (row.reservedBatchCount > 0) {
    label += ` · ${row.batchCount} для отбора`;
  }
  return label;
}
