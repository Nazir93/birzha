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
  /** Кг для отбора в погрузку: физический остаток на складе (журнал возвратов не блокирует). */
  availableForLoadingKg?: number;
};

export function batchToJson(
  batch: Batch,
  nakladnaya?: BatchJson["nakladnaya"],
  allocation?: BatchJson["allocation"],
  extras?: { qualityRejectWrittenOffKg: number },
): BatchJson {
  const s = batch.toPersistenceState();
  const onWarehouseKg = gramsToKg(s.onWarehouseGrams);
  const qualityRejectWrittenOffKg = extras?.qualityRejectWrittenOffKg ?? 0;
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
          /** Журнал возврата не блокирует погрузку на другое направление. */
          availableForLoadingKg: Math.max(0, onWarehouseKg),
        }
      : {}),
  };
}
