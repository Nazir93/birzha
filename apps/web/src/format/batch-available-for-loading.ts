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

/** Партии, которые реально уйдут в новую ПН: полностью возвращённые из отбора не включаем. */
export function batchesRemainingInSelection(batches: readonly BatchListItem[]): BatchListItem[] {
  return batches.filter((b) => batchKgInSelectionRemainder(b) > 0);
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

/**
 * Остаток ящиков на складе по факту ПН: закупка − сумма ящиков в строках погрузочных.
 * `null` — в ПН ящики не заданы, нужна пропорция по кг.
 */
export function remainingPackagesOnShelfFromManifests(b: BatchListItem): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  const inLm = b.packagesInLoadingManifests;
  if (inLm == null || !Number.isFinite(inLm) || inLm < 0) {
    return null;
  }
  return Math.max(0, Math.round(linePk - inLm));
}

/** Ящики, доступные к отбору: факт ПН, иначе пропорция availableKg к totalKg. */
export function estimatedPackageCountForLoading(b: BatchListItem): number | null {
  const fact = remainingPackagesOnShelfFromManifests(b);
  if (fact != null) {
    return fact;
  }
  return estimatedPackagesForKg(b, batchAvailableForLoadingKg(b));
}

/** Ящики в остатке отбора (черновик): факт ПН с учётом блокировки кг, иначе пропорция. */
export function estimatedPackageCountInSelectionRemainder(b: BatchListItem): number | null {
  const fact = remainingPackagesOnShelfFromManifests(b);
  if (fact != null) {
    const avail = batchAvailableForLoadingKg(b);
    const rem = batchKgInSelectionRemainder(b);
    if (avail > 0 && rem < avail && fact > 0) {
      return Math.max(0, Math.round((rem / avail) * fact));
    }
    return rem > 0 ? fact : 0;
  }
  return estimatedPackagesForKg(b, batchKgInSelectionRemainder(b));
}

/**
 * Ящики к возврату на склад.
 * Если в транзите ничего нет — остаток на полке (факт ПН); иначе пропорция по returnable кг.
 */
export function estimatedPackageCountForWarehouseReturn(b: BatchListItem): number | null {
  if (Math.max(0, b.inTransitKg) <= 0) {
    const fact = remainingPackagesOnShelfFromManifests(b);
    if (fact != null) {
      return batchReturnableToWarehouseKg(b) > 0 ? fact : 0;
    }
  }
  return estimatedPackagesForKg(b, batchReturnableToWarehouseKg(b));
}
