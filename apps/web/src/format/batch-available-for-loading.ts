import type { BatchListItem } from "../api/types.js";

/** Сумма кг в журнале «возврат на склад» по партии. */
export function batchQualityRejectReturnKg(batch: BatchListItem): number {
  return batch.qualityRejectWrittenOffKg ?? 0;
}

/**
 * Кг для отбора в погрузку: физический остаток на складе.
 * Возврат из отбора при создании ПН учитывается на сервере один раз; в списке партии не прячутся.
 */
export function batchAvailableForLoadingKg(batch: BatchListItem): number {
  if (batch.availableForLoadingKg != null && Number.isFinite(batch.availableForLoadingKg)) {
    return Math.max(0, batch.availableForLoadingKg);
  }
  return Math.max(0, batch.onWarehouseKg);
}

/**
 * Остаток в отборе к погрузке/догрузке.
 * Вычитает только активную блокировку (blocks_loading), не всю историю журнала возвратов —
 * иначе после «вернуть на склад» в догрузке навсегда 0 кг при полном journal.
 */
export function batchKgInSelectionRemainder(batch: BatchListItem): number {
  const blocking = batch.blockingReturnKg;
  if (blocking != null && Number.isFinite(blocking) && blocking > 0) {
    return Math.max(0, batch.onWarehouseKg - blocking);
  }
  return batchAvailableForLoadingKg(batch);
}

/**
 * Кг, которые ещё можно оформить как «вернуть на склад»:
 * склад + рейс минус журнал; ремонт по inTransit; если журнал полный, но склад есть —
 * можно снова исключить из отбора (включить blocks_loading).
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
  const blocking =
    batch.blockingReturnKg != null && Number.isFinite(batch.blockingReturnKg)
      ? Math.max(0, batch.blockingReturnKg)
      : 0;
  return Math.max(0, onWh - blocking);
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
