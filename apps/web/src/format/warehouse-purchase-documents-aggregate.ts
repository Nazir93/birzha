import type { BatchListItem } from "../api/types.js";
import { batchAvailableForLoadingKg, batchQualityRejectReturnKg } from "./batch-available-for-loading.js";

export type WarehouseDocumentStockRow = {
  documentId: string;
  documentNumber: string;
  lineCount: number;
  /** Физический остаток onWarehouse (возвраты журнала не вычитаются). */
  onWarehouseKg: number;
  /** Доступно к погрузке: onWarehouse − журнал возвратов. */
  availableForLoadingKg: number;
  onWarehousePackages: number;
  inTransitKg: number;
  soldKg: number;
  /** Только журнал «возврат на склад». */
  returnedKg: number;
  /**
   * @deprecated Используйте `returnedKg`. Оставлено для совместимости колонки «Возвращено».
   */
  writtenOffKg: number;
};

/** Кг в журнале возврата на склад (не доменный writtenOff от недостач). */
export function batchReturnedKg(batch: BatchListItem): number {
  return batchQualityRejectReturnKg(batch);
}

/**
 * @deprecated предпочитайте `batchReturnedKg` — раньше путал journal и shortage writtenOff.
 */
export function batchWrittenOffKg(batch: BatchListItem): number {
  return batchReturnedKg(batch);
}

export function batchHasStockActivity(batch: BatchListItem): boolean {
  return (
    (batch.onWarehouseKg ?? 0) > 0 ||
    (batch.inTransitKg ?? 0) > 0 ||
    (batch.soldKg ?? 0) > 0 ||
    (batch.writtenOffKg ?? 0) > 0 ||
    batchReturnedKg(batch) > 0
  );
}

/** Доля ящиков на складе по строке накладной (пропорция onWarehouse к totalKg). */
export function estimateBatchWarehousePackages(batch: BatchListItem): number {
  const totalKg = Number(batch.totalKg ?? 0);
  const onWarehouseKg = Number(batch.onWarehouseKg ?? 0);
  const linePackageCount = Number(batch.nakladnaya?.linePackageCount ?? 0);
  if (!Number.isFinite(totalKg) || !Number.isFinite(onWarehouseKg) || !Number.isFinite(linePackageCount)) {
    return 0;
  }
  if (totalKg <= 0 || onWarehouseKg <= 0 || linePackageCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((linePackageCount * onWarehouseKg) / totalKg));
}

/** Сводка по закупочным накладным на складе (из партий с остатком). */
export function aggregateWarehouseDocumentsFromBatches(
  batches: readonly BatchListItem[],
  options?: { search?: string },
): WarehouseDocumentStockRow[] {
  const map = new Map<string, WarehouseDocumentStockRow>();

  for (const batch of batches) {
    const documentId = batch.nakladnaya?.documentId?.trim();
    if (!documentId) {
      continue;
    }
    const documentNumber = (batch.nakladnaya?.documentNumber ?? "").trim() || documentId;
    const returnedKg = batchReturnedKg(batch);
    const prev = map.get(documentId) ?? {
      documentId,
      documentNumber,
      lineCount: 0,
      onWarehouseKg: 0,
      availableForLoadingKg: 0,
      onWarehousePackages: 0,
      inTransitKg: 0,
      soldKg: 0,
      returnedKg: 0,
      writtenOffKg: 0,
    };
    prev.lineCount += 1;
    prev.onWarehouseKg += batch.onWarehouseKg ?? 0;
    prev.availableForLoadingKg += batchAvailableForLoadingKg(batch);
    prev.onWarehousePackages += estimateBatchWarehousePackages(batch);
    prev.inTransitKg += batch.inTransitKg ?? 0;
    prev.soldKg += batch.soldKg ?? 0;
    prev.returnedKg += returnedKg;
    prev.writtenOffKg += returnedKg;
    map.set(documentId, prev);
  }

  let rows = [...map.values()].filter(
    (row) =>
      row.onWarehouseKg > 0 ||
      row.inTransitKg > 0 ||
      row.soldKg > 0 ||
      row.returnedKg > 0,
  );
  rows.sort((a, b) => b.documentNumber.localeCompare(a.documentNumber, "ru"));

  const q = options?.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => row.documentNumber.toLowerCase().includes(q));
  }
  return rows;
}
