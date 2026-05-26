import type { BatchListItem, TripJson } from "../api/types.js";

import { batchHasRemainingStockKg } from "./purchase-nakladnaya-list-status.js";

function gramsFieldToKg(grams: string | undefined): number {
  if (!grams?.trim()) {
    return 0;
  }
  try {
    return Number(BigInt(grams)) / 1000;
  } catch {
    return 0;
  }
}

/** Сводка по открытым рейсам (из полей полного GET /trips). */
export function sumOpenTripsMassKg(trips: readonly TripJson[]): {
  shippedKg: number;
  remainingInTripKg: number;
  soldKg: number;
} {
  let shippedKg = 0;
  let remainingInTripKg = 0;
  let soldKg = 0;
  for (const t of trips) {
    if (t.status === "closed") {
      continue;
    }
    shippedKg += gramsFieldToKg(t.shippedGrams);
    remainingInTripKg += gramsFieldToKg(t.transitRemainingGrams);
    soldKg += gramsFieldToKg(t.soldGrams);
  }
  return { shippedKg, remainingInTripKg, soldKg };
}

/** Остаток на складах и группировки для диаграмм (по партиям). */
export function sumWarehouseKgFromBatches(
  batches: readonly BatchListItem[],
  whById: Map<string, string>,
): {
  warehouseKg: number;
  writtenOffKg: number;
  byWarehouseKg: Map<string, number>;
  byProductGroupKg: Map<string, number>;
  batchCount: number;
} {
  let warehouseKg = 0;
  let writtenOffKg = 0;
  const byWarehouseKg = new Map<string, number>();
  const byProductGroupKg = new Map<string, number>();

  for (const b of batches) {
    if (b.onWarehouseKg > 0) {
      warehouseKg += b.onWarehouseKg;
    }
    writtenOffKg += b.writtenOffKg ?? 0;

    const wid = b.nakladnaya?.warehouseId ?? "";
    const whLabel = wid ? whById.get(wid) ?? "Без названия" : "Без склада";
    byWarehouseKg.set(whLabel, (byWarehouseKg.get(whLabel) ?? 0) + b.onWarehouseKg);

    if (!batchHasRemainingStockKg(b)) {
      continue;
    }
    const g = (b.nakladnaya?.productGroup ?? "").trim() || "Без вида";
    const workKg = b.onWarehouseKg + b.inTransitKg + (b.pendingInboundKg ?? 0);
    byProductGroupKg.set(g, (byProductGroupKg.get(g) ?? 0) + workKg);
  }

  let batchCount = 0;
  for (const b of batches) {
    if (batchHasRemainingStockKg(b)) {
      batchCount += 1;
    }
  }

  return { warehouseKg, writtenOffKg, byWarehouseKg, byProductGroupKg, batchCount };
}
