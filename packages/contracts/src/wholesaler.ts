import { z } from "zod";

export const createWholesalerBodySchema = z.object({
  name: z.string().min(1).max(160),
  sortOrder: z.number().int().optional(),
});

export type CreateWholesalerBody = z.infer<typeof createWholesalerBodySchema>;
