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
  /** Ящики в этой отгрузке (опционально); целое неотрицательное. */
  packageCount: z.number().int().nonnegative().optional(),
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

/** POST /product-grades — калибр / строка накладной (`code` как на бумаге, уникален). */
export const createProductGradeBodySchema = z.object({
  code: z.string().min(1).max(64).trim(),
  displayName: z.string().min(1).max(200).trim(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Группа номенклатуры (помидоры, огурцы, перец…); у разных товаров разные калибры. */
  productGroup: z.string().min(1).max(120).trim().optional(),
});

/** POST /warehouses — склад поступления (название произвольное; код — латиница, уникальный, опционально). */
export const createWarehouseBodySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  /** Латинский код для отчётов и сортировки; если не задан — генерируется на сервере. */
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "code: только латиница, цифры, точка, подчёркивание, дефис")
    .optional(),
});

/** POST /auth/login */
export const loginBodySchema = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

const optionalTrim = (s: string | null | undefined): string | null => (s == null || s.trim() === "" ? null : s.trim().slice(0, 200));

/** POST /trips */
export const createTripBodySchema = z.object({
  id: z.string().min(1),
  tripNumber: z.string().min(1),
  /** Номер/марка ТС, как в «общей накладной». */
  vehicleLabel: z.string().max(200).optional().nullable().transform(optionalTrim),
  /** Водитель (фамилия/как в реестре). */
  driverName: z.string().max(200).optional().nullable().transform(optionalTrim),
  /** План/факт отправления, ISO-8601 (с фронта — `toISOString()`). */
  departedAt: z
    .string()
    .max(50)
    .nullish()
    .transform((s) => (s == null || s.trim() === "" ? null : s.trim()))
    .refine((s) => s == null || !Number.isNaN(Date.parse(s)), { message: "departedAt: неверная дата" }),
  /** Кому закрепить рейс в поле (users.id); пусто — общий рейс. */
  assignedSellerUserId: z
    .string()
    .max(200)
    .nullish()
    .transform((s) => (s == null || s.trim() === "" ? null : s.trim())),
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
