import { z } from "zod";

/** Оценка качества (глоссарий `business-glossary.md`). */
export const BATCH_QUALITY_TIERS = ["standard", "weak", "reject"] as const;

/**
 * Стартовый набор `code` (миграция `ship_destinations`); в UI/валидации бэка список берётся из БД.
 * Оставляем для подписей по умолчанию / оффлайн.
 */
export const BATCH_DESTINATIONS = ["moscow", "regions", "discount", "writeoff"] as const;

const tierOrNull = z.union([z.enum(BATCH_QUALITY_TIERS), z.null()]);
const destOrNull = z.union([z.string().min(1).max(64), z.null()]);

/**
 * Частичное обновление: `null` сбрасывает поле; поле не передано — не менять.
 * Хотя бы одно из полей должно присутствовать в JSON.
 */
export const updateBatchAllocationBodySchema = z
  .object({
    qualityTier: tierOrNull.optional(),
    destination: destOrNull.optional(),
  })
  .refine((o) => o.qualityTier !== undefined || o.destination !== undefined, {
    message: "укажите qualityTier и/или destination",
  });

export type UpdateBatchAllocationBody = z.infer<typeof updateBatchAllocationBodySchema>;
