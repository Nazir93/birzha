import { z } from "zod";

const kinds = z.literal("quality_reject");

/** Списание с остатка на складе: частичный «брак» (кг). */
export const postWarehouseWriteOffBodySchema = z.object({
  kind: kinds,
  /** Масса к списанию; `insufficient_stock`, если больше, чем остаток на складе по партии. */
  kg: z
    .number()
    .finite()
    .positive()
    .max(1_000_000, "кг_слишком_много"),
});

export type PostWarehouseWriteOffBody = z.infer<typeof postWarehouseWriteOffBodySchema>;
