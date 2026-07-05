import type { BatchPersistenceState } from "@birzha/domain";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { gramsToKg } from "../../application/units/mass.js";
import { batches } from "../../db/schema.js";

type BatchInsert = InferInsertModel<typeof batches>;
type BatchRow = InferSelectModel<typeof batches>;
export function persistenceStateToInsert(state: BatchPersistenceState): BatchInsert {
  return {
    id: state.id,
    purchaseId: state.purchaseId,
    totalGrams: state.totalGrams,
    pendingInboundGrams: state.pendingInboundGrams,
    onWarehouseGrams: state.onWarehouseGrams,
    inTransitGrams: state.inTransitGrams,
    soldGrams: state.soldGrams,
    writtenOffGrams: state.writtenOffGrams,
    pricePerKg: String(state.pricePerKg),
    warehouseId: state.warehouseId ?? null,
  };
}

export function rowToPersistenceState(row: BatchRow): BatchPersistenceState {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    totalGrams: row.totalGrams,
    pricePerKg: Number(row.pricePerKg),
    pendingInboundGrams: row.pendingInboundGrams,
    onWarehouseGrams: row.onWarehouseGrams,
    inTransitGrams: row.inTransitGrams,
    soldGrams: row.soldGrams,
    writtenOffGrams: row.writtenOffGrams,
    warehouseId: row.warehouseId,
  };
}

/** Кг для HTTP/UI из снимка партии. */
export function persistenceStateOnWarehouseKg(state: BatchPersistenceState): number {
  return gramsToKg(state.onWarehouseGrams);
}

export function persistenceStateSoldKg(state: BatchPersistenceState): number {
  return gramsToKg(state.soldGrams);
}
