import { z } from "zod";

const kinds = z.literal("quality_reject");

/**
 * Журнал «возврат на склад» (кг). Остаток партии onWarehouse не уменьшается;
 * лимит записи: onWarehouse − уже в журнале. При записи уменьшаются строки активных ПН;
 * доступность к погрузке остаётся равной onWarehouse (можно грузить в другой рейс).
 */
export const postWarehouseWriteOffBodySchema = z.object({
  kind: kinds,
  /** Масса к учёту в журнале; ошибка, если больше доступного к возврату. */
  kg: z
    .number()
    .finite()
    .positive()
    .max(1_000_000, "кг_слишком_много"),
});

export type PostWarehouseWriteOffBody = z.infer<typeof postWarehouseWriteOffBodySchema>;
