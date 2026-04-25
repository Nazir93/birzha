import type { Batch } from "@birzha/domain";

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
   * Сумма кг, списанных как «брак с остатка» (журнал `quality_reject`), без прочих списаний в `writtenOffKg`.
   * Только при PostgreSQL; иначе поле нет.
   */
  qualityRejectWrittenOffKg?: number;
};

export function batchToJson(
  batch: Batch,
  nakladnaya?: BatchJson["nakladnaya"],
  allocation?: BatchJson["allocation"],
  extras?: { qualityRejectWrittenOffKg: number },
): BatchJson {
  const s = batch.toPersistenceState();
  return {
    id: s.id,
    purchaseId: s.purchaseId,
    totalKg: s.totalKg,
    pricePerKg: s.pricePerKg,
    pendingInboundKg: s.pendingInboundKg,
    onWarehouseKg: s.onWarehouseKg,
    inTransitKg: s.inTransitKg,
    soldKg: s.soldKg,
    writtenOffKg: s.writtenOffKg,
    ...(nakladnaya ? { nakladnaya } : {}),
    ...(allocation ? { allocation } : {}),
    ...(extras ? { qualityRejectWrittenOffKg: extras.qualityRejectWrittenOffKg } : {}),
  };
}
