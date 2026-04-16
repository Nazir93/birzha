import type { FastifyInstance } from "fastify";

import type { ApplySyncActionUseCase } from "../application/sync/apply-sync-action.use-case.js";
import { syncRequestSchema } from "../application/sync/sync-request.schema.js";

import { sendMappedError } from "./map-http-error.js";

export function registerSyncRoutes(app: FastifyInstance, applySync: ApplySyncActionUseCase): void {
  app.post("/sync", async (req, reply) => {
    try {
      const body = syncRequestSchema.parse(req.body);
      const result = await applySync.execute(body);
      return reply.code(200).send(result);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
