import { z } from "zod";

/** POST /batches */
export const createBatchBodySchema = z.object({
  id: z.string().min(1),
  purchaseId: z.string().min(1),
  totalKg: z.number().finite().positive(),
  pricePerKg: z.number().finite().nonnegative(),
  distribution: z.enum(["awaiting_receipt", "on_hand"]),
});

/** POST /batches/:id/receive-on-warehouse */
export const receiveBodySchema = z.object({
  kg: z.number().finite().positive(),
});

/** POST /batches/:id/ship-to-trip */
export const shipBodySchema = z.object({
  kg: z.number().finite().positive(),
  tripId: z.string().min(1),
});

const sellFromTripBodyBase = z.object({
  tripId: z.string().min(1),
  kg: z.number().finite().positive(),
  saleId: z.string().min(1),
  pricePerKg: z.number().finite().nonnegative(),
  paymentKind: z.enum(["cash", "debt", "mixed"]).optional(),
  cashKopecksMixed: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  /** Идентификатор из GET /counterparties; если задан — имя для отчёта берётся из справочника (снимок в `client_label`). */
  counterpartyId: z.string().min(1).max(64).optional(),
  /** Подпись клиента для отчёта по рейсу; игнорируется, если задан `counterpartyId`. */
  clientLabel: z.string().max(120).optional(),
});

function refineMixedSalePayment(data: { paymentKind?: string; cashKopecksMixed?: unknown }, ctx: z.RefinementCtx) {
  if (data.paymentKind === "mixed" && data.cashKopecksMixed === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cashKopecksMixed обязателен при paymentKind=mixed",
    });
  }
}

/** POST /batches/:id/sell-from-trip */
export const sellFromTripBodySchema = sellFromTripBodyBase.superRefine(refineMixedSalePayment);

/** Payload `sell_from_trip` в POST /sync (batchId в теле, не в пути). */
export const sellFromTripSyncPayloadSchema = z
  .object({ batchId: z.string().min(1) })
  .merge(sellFromTripBodyBase)
  .superRefine(refineMixedSalePayment);

/** POST /batches/:id/record-trip-shortage */
export const recordTripShortageBodySchema = z.object({
  tripId: z.string().min(1),
  kg: z.number().finite().positive(),
  reason: z.string().min(1),
});

/** POST /counterparties */
export const createCounterpartyBodySchema = z.object({
  displayName: z.string().min(1).max(200).trim(),
});

/** POST /auth/login */
export const loginBodySchema = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

/** POST /trips */
export const createTripBodySchema = z.object({
  id: z.string().min(1),
  tripNumber: z.string().min(1),
});

/** Payload `ship_to_trip` в POST /sync */
export const shipToTripSyncPayloadSchema = shipBodySchema.extend({
  batchId: z.string().min(1),
});

/** Payload `receive_on_warehouse` в POST /sync */
export const receiveOnWarehouseSyncPayloadSchema = receiveBodySchema.extend({
  batchId: z.string().min(1),
});

/** Payload `record_trip_shortage` в POST /sync */
export const recordTripShortageSyncPayloadSchema = recordTripShortageBodySchema.extend({
  batchId: z.string().min(1),
});
