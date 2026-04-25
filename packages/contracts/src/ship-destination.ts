import { z } from "zod";

export const createShipDestinationBodySchema = z.object({
  code: z.string().min(1).max(64),
  displayName: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type CreateShipDestinationBody = z.infer<typeof createShipDestinationBodySchema>;
