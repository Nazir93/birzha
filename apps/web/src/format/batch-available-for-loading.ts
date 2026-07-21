import type { BatchListItem } from "../api/types.js";

/** Сумма кг в журнале «возврат на склад» по партии. */
export function batchQualityRejectReturnKg(batch: BatchListItem): number {
  return batch.qualityRejectWrittenOffKg ?? 0;
}

/**
 * Кг, доступные для отбора в погрузку: физический остаток на складе.
 * Журнал возвратов не уменьшает доступность — товар можно грузить в другое направление.
 * При наличии поля с API — используем его; иначе `onWarehouseKg`.
 */
export function batchAvailableForLoadingKg(batch: BatchListItem): number {
  if (batch.availableForLoadingKg != null && Number.isFinite(batch.availableForLoadingKg)) {
    return Math.max(0, batch.availableForLoadingKg);
  }
  return Math.max(0, batch.onWarehouseKg);
}

/** Ящики, доступные к отбору: пропорция availableKg к totalKg × ящиков по строке накладной. */
export function estimatedPackageCountForLoading(b: BatchListItem): number | null {
  const avail = batchAvailableForLoadingKg(b);
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (b.totalKg <= 0 || avail <= 0) {
    return null;
  }
  return Math.max(0, Math.round((avail / b.totalKg) * linePk));
}
