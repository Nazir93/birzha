import type { BatchListItem } from "../api/types.js";

/** Сумма кг в журнале «возврат на склад» по партии. */
export function batchQualityRejectReturnKg(batch: BatchListItem): number {
  return batch.qualityRejectWrittenOffKg ?? 0;
}

/**
 * Свободно на складе (склад, список складов, догрузка): onWarehouse − черновые ПН.
 * Возврат из отбора лежит на складе и здесь не вычитается.
 */
export function batchAvailableForLoadingKg(batch: BatchListItem): number {
  if (batch.availableForLoadingKg != null && Number.isFinite(batch.availableForLoadingKg)) {
    return Math.max(0, batch.availableForLoadingKg);
  }
  return Math.max(0, batch.onWarehouseKg);
}

function blockingReturnKg(batch: BatchListItem): number {
  const blocking = batch.blockingReturnKg;
  return blocking != null && Number.isFinite(blocking) && blocking > 0 ? blocking : 0;
}

/**
 * Остаток в отборе новой ПН: свободный склад − активный возврат из отбора (blocks_loading).
 * Так же сервер считает строки при создании ПН.
 */
export function batchKgInSelectionRemainder(batch: BatchListItem): number {
  return Math.max(0, batchAvailableForLoadingKg(batch) - blockingReturnKg(batch));
}

/** Партии, которые реально уйдут в новую ПН: полностью возвращённые из отбора не включаем. */
export function batchesRemainingInSelection(batches: readonly BatchListItem[]): BatchListItem[] {
  return batches.filter((b) => batchKgInSelectionRemainder(b) > 0);
}

/**
 * Кг, которые ещё можно оформить как «вернуть на склад» (как maxWarehouseReturnGrams на API):
 * место в журнале, ремонт по inTransit, либо незаблокированный остаток на складе
 * после возврата с ПН (журнал без blocks_loading не режет повторный возврат из отбора).
 */
export function batchReturnableToWarehouseKg(batch: BatchListItem): number {
  const onWh = Math.max(0, batch.onWarehouseKg);
  const inTransit = Math.max(0, batch.inTransitKg);
  const already = Math.max(0, batchQualityRejectReturnKg(batch));
  const leftover = Math.max(0, onWh + inTransit - already);
  const blocking =
    batch.blockingReturnKg != null && Number.isFinite(batch.blockingReturnKg)
      ? Math.max(0, batch.blockingReturnKg)
      : 0;
  const unblockedOnWarehouse = Math.max(0, onWh - blocking);
  return Math.max(leftover, inTransit, unblockedOnWarehouse);
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

function explicitCount(n: number | undefined): number | null {
  return n != null && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Свободные ящики на складе по факту: закупка − ящики во всех строках ПН.
 * `null` — в ПН ящики не заданы явно → пропорция по кг.
 */
export function remainingPackagesOnShelfFromManifests(b: BatchListItem): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  const inLm = explicitCount(b.packagesInLoadingManifests);
  if (inLm == null) {
    return null;
  }
  return Math.max(0, Math.round(linePk - inLm));
}

/** Ящики свободного склада (склад, список складов, догрузка): факт ПН, иначе доля по кг. */
export function estimatedPackageCountForLoading(b: BatchListItem): number | null {
  if (batchAvailableForLoadingKg(b) <= 0) {
    return estimatedPackagesForKg(b, 0);
  }
  const fact = remainingPackagesOnShelfFromManifests(b);
  if (fact != null) {
    return fact;
  }
  return estimatedPackagesForKg(b, batchAvailableForLoadingKg(b));
}

/**
 * Ящики в остатке отбора: свободный склад − ящики, введённые при возврате из отбора.
 * Если при возврате ящики не вводили — уменьшаем долей по кг.
 */
export function estimatedPackageCountInSelectionRemainder(b: BatchListItem): number | null {
  const remKg = batchKgInSelectionRemainder(b);
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (remKg <= 0) {
    return 0;
  }
  const returned = explicitCount(b.packagesInBlockingWriteOffs);
  const shelfFact = remainingPackagesOnShelfFromManifests(b);
  if (returned != null) {
    const shelf = shelfFact ?? estimatedPackagesForKg(b, batchAvailableForLoadingKg(b)) ?? 0;
    return Math.max(0, Math.round(shelf - returned));
  }
  if (shelfFact == null) {
    return estimatedPackagesForKg(b, remKg);
  }
  const availKg = batchAvailableForLoadingKg(b);
  return availKg > 0 && remKg < availKg ? Math.round((shelfFact * remKg) / availKg) : shelfFact;
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
