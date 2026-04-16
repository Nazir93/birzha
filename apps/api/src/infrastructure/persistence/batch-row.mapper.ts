import type { BatchPersistenceState } from "@birzha/domain";

import type { batches } from "../../db/schema.js";
import { gramsToKg, kgToGrams } from "./batch-mass.js";

export type BatchRow = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;

export function persistenceStateToInsert(state: BatchPersistenceState): BatchInsert {
  return {
    id: state.id,
    purchaseId: state.purchaseId,
    totalGrams: kgToGrams(state.totalKg),
    pendingInboundGrams: kgToGrams(state.pendingInboundKg),
    onWarehouseGrams: kgToGrams(state.onWarehouseKg),
    inTransitGrams: kgToGrams(state.inTransitKg),
    soldGrams: kgToGrams(state.soldKg),
    writtenOffGrams: kgToGrams(state.writtenOffKg),
    pricePerKg: state.pricePerKg.toFixed(6),
  };
}

export function rowToPersistenceState(row: BatchRow): BatchPersistenceState {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    totalKg: gramsToKg(row.totalGrams),
    pendingInboundKg: gramsToKg(row.pendingInboundGrams),
    onWarehouseKg: gramsToKg(row.onWarehouseGrams),
    inTransitKg: gramsToKg(row.inTransitGrams),
    soldKg: gramsToKg(row.soldGrams),
    writtenOffKg: gramsToKg(row.writtenOffGrams),
    pricePerKg: Number(row.pricePerKg),
  };
}
