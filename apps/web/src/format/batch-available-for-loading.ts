import type { BatchListItem } from "../api/types.js";

/** Сумма кг в журнале «возврат на склад» по партии. */
export function batchQualityRejectReturnKg(batch: BatchListItem): number {
  return batch.qualityRejectWrittenOffKg ?? 0;
}

/**
 * Кг, доступные для отбора в погрузку: физический остаток на складе минус возврат из отбора.
 * Возврат с рейса на склад (API availableForLoadingKg) доступность не уменьшает.
 * При наличии поля с API — используем его; иначе `onWarehouseKg`.
 */
export function batchAvailableForLoadingKg(batch: BatchListItem): number {
  if (batch.availableForLoadingKg != null && Number.isFinite(batch.availableForLoadingKg)) {
    return Math.max(0, batch.availableForLoadingKg);
  }
  return Math.max(0, batch.onWarehouseKg);
}

/**
 * Остаток в черновом отборе (ещё нет сохранённой ПН): физический склад минус журнал возврата.
 * Не через `availableForLoadingKg` — иначе при blocks_loading журнал вычлось бы дважды.
 */
export function batchKgInSelectionRemainder(batch: BatchListItem): number {
  return Math.max(0, batch.onWarehouseKg - batchQualityRejectReturnKg(batch));
}

/**
 * Кг, которые ещё можно оформить как «вернуть на склад»:
 * склад + в рейсе минус журнал; если журнал уже полный, но масса в рейсе — ремонт (снять с ПН).
 */
export function batchReturnableToWarehouseKg(batch: BatchListItem): number {
  const onWh = Math.max(0, batch.onWarehouseKg);
  const inTransit = Math.max(0, batch.inTransitKg);
  const already = Math.max(0, batchQualityRejectReturnKg(batch));
  const leftover = onWh + inTransit - already;
  if (leftover > 0) {
    return leftover;
  }
  if (inTransit > 0) {
    return inTransit;
  }
  return 0;
}

function estimatedPackagesForKg(b: BatchListItem, availKg: number): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (b.totalKg <= 0 || availKg <= 0) {
    return null;
  }
  return Math.max(0, Math.round((availKg / b.totalKg) * linePk));
}

/** Ящики, доступные к отбору: пропорция availableKg к totalKg × ящиков по строке накладной. */
export function estimatedPackageCountForLoading(b: BatchListItem): number | null {
  return estimatedPackagesForKg(b, batchAvailableForLoadingKg(b));
}

/** Ящики в остатке отбора (черновик): по selection remainder. */
export function estimatedPackageCountInSelectionRemainder(b: BatchListItem): number | null {
  return estimatedPackagesForKg(b, batchKgInSelectionRemainder(b));
}

/** Ящики, доступные к возврату на склад (та же пропорция, но по returnable кг). */
export function estimatedPackageCountForWarehouseReturn(b: BatchListItem): number | null {
  return estimatedPackagesForKg(b, batchReturnableToWarehouseKg(b));
}
