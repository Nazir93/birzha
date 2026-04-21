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
    productGradeCode: string | null;
    /** Из справочника калибров — вид товара (помидоры, огурцы…). */
    productGroup: string | null;
    documentNumber: string | null;
  };
};

export function batchToJson(batch: Batch, nakladnaya?: BatchJson["nakladnaya"]): BatchJson {
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
  };
}
