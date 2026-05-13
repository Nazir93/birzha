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
  /** Розница или опт (агрегируется в отчёте по рейсу). По умолчанию розница. */
  saleChannel: z.enum(["retail", "wholesale"]).optional().default("retail"),
  paymentKind: z.enum(["cash", "debt", "mixed", "card_transfer"]).optional(),
  cashKopecksMixed: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  /** При `card_transfer`: сумма перевода на карту в копейках (остаток выручки — наличными). */
  cardTransferKopecks: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  /** Идентификатор из GET /counterparties; если задан — имя для отчёта берётся из справочника (снимок в `client_label`). */
  counterpartyId: z.string().min(1).max(64).optional(),
  /** Подпись клиента для отчёта по рейсу; игнорируется, если задан `counterpartyId`. */
  clientLabel: z.string().max(120).optional(),
  /** При `saleChannel=wholesale` — id из GET /wholesalers (активный оптовик). */
  wholesaleBuyerId: z.string().min(1).max(64).optional(),
});

function refineWholesaleBuyer(
  data: { saleChannel?: string; wholesaleBuyerId?: string },
  ctx: z.RefinementCtx,
) {
  if (data.saleChannel === "wholesale") {
    const id = data.wholesaleBuyerId?.trim();
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wholesaleBuyerId обязателен при saleChannel=wholesale",
        path: ["wholesaleBuyerId"],
      });
    }
  }
}
function refineMixedSalePayment(data: { paymentKind?: string; cashKopecksMixed?: unknown }, ctx: z.RefinementCtx) {
  if (data.paymentKind === "mixed" && data.cashKopecksMixed === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cashKopecksMixed обязателен при paymentKind=mixed",
    });
  }
}

function refineCardTransferSalePayment(
  data: { paymentKind?: string; cardTransferKopecks?: unknown },
  ctx: z.RefinementCtx,
) {
  if (data.paymentKind === "card_transfer" && data.cardTransferKopecks === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cardTransferKopecks обязателен при paymentKind=card_transfer",
    });
  }
}

/** POST /batches/:id/sell-from-trip */
export const sellFromTripBodySchema = sellFromTripBodyBase
  .superRefine(refineMixedSalePayment)
  .superRefine(refineCardTransferSalePayment)
  .superRefine(refineWholesaleBuyer);

/** Payload `sell_from_trip` в POST /sync (batchId в теле, не в пути). */
export const sellFromTripSyncPayloadSchema = z
  .object({ batchId: z.string().min(1) })
  .merge(sellFromTripBodyBase)
  .superRefine(refineMixedSalePayment)
  .superRefine(refineCardTransferSalePayment)
  .superRefine(refineWholesaleBuyer);
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
  /** Кому закрепить рейс в поле (users.id); пусто — продавцам не показывается. */
  assignedSellerUserId: z
    .string()
    .max(200)
    .nullish()
    .transform((s) => (s == null || s.trim() === "" ? null : s.trim())),
});

/** POST /trips/:tripId/assign-seller — отгрузить рейс под конкретного продавца. */
export const assignTripSellerBodySchema = z.object({
  sellerUserId: z.string().min(1).max(200).transform((s) => s.trim()),
});

export const createLoadingManifestBodySchema = z.object({
  id: z.string().min(1).max(200).optional(),
  manifestNumber: z.string().min(1).max(80).transform((s) => s.trim()),
  docDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "docDate: YYYY-MM-DD"),
  warehouseId: z.string().min(1).max(200).transform((s) => s.trim()),
  destinationCode: z.string().min(1).max(120).transform((s) => s.trim()),
  batchIds: z.array(z.string().min(1).max(200)).min(1),
});

export const assignLoadingManifestTripBodySchema = z.object({
  tripId: z.string().min(1).max(200).transform((s) => s.trim()),
});

/** GET /loading-manifests/reserved-batch-ids?warehouseId= — партии, уже в строках ПН на этом складе. */
export const loadingManifestReservedBatchIdsQuerySchema = z.object({
  warehouseId: z.string().min(1).max(200).transform((s) => s.trim()),
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
