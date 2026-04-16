import { z } from "zod";

const sellPayloadSchema = z
  .object({
    batchId: z.string().min(1),
    tripId: z.string().min(1),
    kg: z.number().finite().positive(),
    saleId: z.string().min(1),
    pricePerKg: z.number().finite().nonnegative(),
    paymentKind: z.enum(["cash", "debt", "mixed"]).optional(),
    cashKopecksMixed: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentKind === "mixed" && data.cashKopecksMixed === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cashKopecksMixed обязателен при paymentKind=mixed",
      });
    }
  });

export const syncRequestSchema = z.discriminatedUnion("actionType", [
  z.object({
    deviceId: z.string().min(1),
    localActionId: z.string().min(1),
    actionType: z.literal("sell_from_trip"),
    payload: sellPayloadSchema,
  }),
  z.object({
    deviceId: z.string().min(1),
    localActionId: z.string().min(1),
    actionType: z.literal("ship_to_trip"),
    payload: z.object({
      batchId: z.string().min(1),
      tripId: z.string().min(1),
      kg: z.number().finite().positive(),
    }),
  }),
  z.object({
    deviceId: z.string().min(1),
    localActionId: z.string().min(1),
    actionType: z.literal("record_trip_shortage"),
    payload: z.object({
      batchId: z.string().min(1),
      tripId: z.string().min(1),
      kg: z.number().finite().positive(),
      reason: z.string().min(1),
    }),
  }),
  z.object({
    deviceId: z.string().min(1),
    localActionId: z.string().min(1),
    actionType: z.literal("receive_on_warehouse"),
    payload: z.object({
      batchId: z.string().min(1),
      kg: z.number().finite().positive(),
    }),
  }),
  z.object({
    deviceId: z.string().min(1),
    localActionId: z.string().min(1),
    actionType: z.literal("create_trip"),
    payload: z.object({
      id: z.string().min(1),
      tripNumber: z.string().min(1),
    }),
  }),
]);

export type SyncRequestBody = z.infer<typeof syncRequestSchema>;
