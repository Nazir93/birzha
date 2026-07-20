import { z } from "zod";

export const createSupplierBodySchema = z.object({
  name: z.string().min(1).max(160),
  sortOrder: z.number().int().optional(),
});

export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
