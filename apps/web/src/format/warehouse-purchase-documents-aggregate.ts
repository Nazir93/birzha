import type { BatchListItem } from "../api/types.js";

export type WarehouseDocumentStockRow = {
  documentId: string;
  documentNumber: string;
  lineCount: number;
  onWarehouseKg: number;
  onWarehousePackages: number;
  inTransitKg: number;
  soldKg: number;
  writtenOffKg: number;
};

/** Кг, зафиксированные в журнале возврата на склад (масса onWarehouse не уменьшается). */
export function batchWrittenOffKg(batch: BatchListItem): number {
  const fromLedger = batch.qualityRejectWrittenOffKg;
  if (fromLedger != null && fromLedger > 0) {
    return fromLedger;
  }
  return batch.writtenOffKg ?? 0;
}

export function batchHasStockActivity(batch: BatchListItem): boolean {
  return (
    (batch.onWarehouseKg ?? 0) > 0 ||
    (batch.inTransitKg ?? 0) > 0 ||
    (batch.soldKg ?? 0) > 0 ||
    batchWrittenOffKg(batch) > 0
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
    const prev = map.get(documentId) ?? {
      documentId,
      documentNumber,
      lineCount: 0,
      onWarehouseKg: 0,
      onWarehousePackages: 0,
      inTransitKg: 0,
      soldKg: 0,
      writtenOffKg: 0,
    };
    prev.lineCount += 1;
    prev.onWarehouseKg += batch.onWarehouseKg ?? 0;
    prev.onWarehousePackages += estimateBatchWarehousePackages(batch);
    prev.inTransitKg += batch.inTransitKg ?? 0;
    prev.soldKg += batch.soldKg ?? 0;
    prev.writtenOffKg += batchWrittenOffKg(batch);
    map.set(documentId, prev);
  }

  let rows = [...map.values()].filter(
    (row) =>
      row.onWarehouseKg > 0 ||
      row.inTransitKg > 0 ||
      row.soldKg > 0 ||
      row.writtenOffKg > 0,
  );
  rows.sort((a, b) => b.documentNumber.localeCompare(a.documentNumber, "ru"));

  const q = options?.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => row.documentNumber.toLowerCase().includes(q));
  }
  return rows;
}
