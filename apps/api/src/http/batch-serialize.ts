import type { Batch } from "@birzha/domain";

import { gramsToKg } from "../application/units/mass.js";

export type BatchJson = {
  id: string;
  purchaseId: string;
  totalKg: number;
  pricePerKg: number;
  pendingInboundKg: number;
  onWarehouseKg: number;
  inTransitKg: number;
  soldKg: number;
  writtenOffKg: number;
  /** Если партия заведена строкой закупочной накладной — код калибра и номер документа. */
  nakladnaya?: {
    /** `purchase_documents.id` — для группировки партий одной накладной. */
    documentId: string | null;
    /** Склад поступления по закупочной накладной. */
    warehouseId: string | null;
    productGradeCode: string | null;
    /** Из справочника калибров — вид товара (помидоры, огурцы…). */
    productGroup: string | null;
    documentNumber: string | null;
    /**
     * Ящиков по строке накладной (как в документе). Остаток в ящиках на UI — пропорция
     * `onWarehouseKg / totalKg` к этому числу (см. «Распределение»).
     */
    linePackageCount: number | null;
    /** Тепличник (снимок с закупочной накладной). */
    supplierName: string | null;
    /** Дата закупочной накладной YYYY-MM-DD. */
    docDate: string | null;
  };
  /** Присвоение качества / направления (PostgreSQL); при in-memory API может отсутствовать. */
  allocation?: {
    qualityTier: string | null;
    destination: string | null;
  };
  /**
   * Сумма кг в журнале «возврат на склад» (`quality_reject`), без прочих списаний в `writtenOffKg`.
   * Только при PostgreSQL; иначе поле нет.
   */
  qualityRejectWrittenOffKg?: number;
  /**
   * Свободно на складе: onWarehouse − кг в черновых ПН (как на сервере при догрузке).
   * Возврат из отбора (blocks_loading) здесь не вычитается — он лежит на складе.
   */
  availableForLoadingKg?: number;
  /**
   * Активная блокировка из отбора (blocks_loading) — для UI «остаток в отборе».
   * Не путать с qualityRejectWrittenOffKg (вся история журнала).
   */
  blockingReturnKg?: number;
  /**
   * Сумма ящиков в строках погрузочных накладных по этой партии (если в ПН ящики заданы явно).
   * Остаток ящиков на складе в UI: linePackageCount − это поле (− packagesInBlockingWriteOffs).
   */
  packagesInLoadingManifests?: number;
  /**
   * Ящики в возвратах из отбора (blocks_loading), если заданы явно в журнале.
   * Уменьшают «остаток, ящ.» в отборе: linePackageCount − ПН − это поле.
   */
  packagesInBlockingWriteOffs?: number;
};

export function batchToJson(
  batch: Batch,
  nakladnaya?: BatchJson["nakladnaya"],
  allocation?: BatchJson["allocation"],
  extras?: {
    qualityRejectWrittenOffKg: number;
    blockingReturnKg?: number;
    packagesInLoadingManifests?: number;
    packagesInBlockingWriteOffs?: number;
    /** Кг в черновых ПН (без рейса): ещё на складе, но уже не свободны. */
    reservedOnDraftManifestsKg?: number;
  },
): BatchJson {
  const s = batch.toPersistenceState();
  const onWarehouseKg = gramsToKg(s.onWarehouseGrams);
  const reservedOnDraftManifestsKg = Math.max(0, extras?.reservedOnDraftManifestsKg ?? 0);
  const qualityRejectWrittenOffKg = extras?.qualityRejectWrittenOffKg ?? 0;
  const blockingReturnKg = extras?.blockingReturnKg ?? 0;
  const packagesInLoadingManifests = extras?.packagesInLoadingManifests;
  const packagesInBlockingWriteOffs = extras?.packagesInBlockingWriteOffs;
  return {
    id: s.id,
    purchaseId: s.purchaseId,
    totalKg: gramsToKg(s.totalGrams),
    pricePerKg: s.pricePerKg,
    pendingInboundKg: gramsToKg(s.pendingInboundGrams),
    onWarehouseKg,
    inTransitKg: gramsToKg(s.inTransitGrams),
    soldKg: gramsToKg(s.soldGrams),
    writtenOffKg: gramsToKg(s.writtenOffGrams),
    ...(nakladnaya ? { nakladnaya } : {}),
    ...(allocation ? { allocation } : {}),
    ...(extras
      ? {
          qualityRejectWrittenOffKg,
          blockingReturnKg,
          // Блокировка возврата из отбора — только в «остатке в отборе», не здесь.
          availableForLoadingKg: Math.max(0, onWarehouseKg - reservedOnDraftManifestsKg),
          ...(packagesInLoadingManifests != null
            ? { packagesInLoadingManifests }
            : {}),
          ...(packagesInBlockingWriteOffs != null
            ? { packagesInBlockingWriteOffs }
            : {}),
        }
      : {}),
  };
}
