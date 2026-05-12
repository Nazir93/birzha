import { createWholesalerBodySchema } from "@birzha/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { WholesalerRepository } from "../application/ports/wholesaler-repository.port.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerWholesalerRoutes(
  app: FastifyInstance,
  wholesalers: WholesalerRepository,
  routeAuth: BusinessRouteAuth,
): void {
  app.get("/wholesalers", { ...withPreHandlers(routeAuth.catalogRead) }, async (_req, reply) => {
    try {
      const list = await wholesalers.listAll();
      return reply.send({ wholesalers: list });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/wholesalers", { ...withPreHandlers(routeAuth.inventoryCatalogWrite) }, async (req, reply) => {
    try {
      const body = createWholesalerBodySchema.parse(req.body);
      const w = await wholesalers.create(body.name, body.sortOrder ?? 0);
      return reply.code(201).send({ wholesaler: w });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete("/wholesalers/:wholesalerId", { ...withPreHandlers(routeAuth.inventoryCatalogWrite) }, async (req, reply) => {
    try {
      const params = z.object({ wholesalerId: z.string().min(1) }).parse(req.params);
      const existing = await wholesalers.findById(params.wholesalerId);
      if (!existing) {
        return reply.code(404).send({ error: "wholesaler_not_found" });
      }
      await wholesalers.setActive(params.wholesalerId, false);
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
