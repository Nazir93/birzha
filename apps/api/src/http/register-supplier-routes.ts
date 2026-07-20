import { createSupplierBodySchema } from "@birzha/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { SupplierRepository } from "../application/ports/supplier-repository.port.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerSupplierRoutes(
  app: FastifyInstance,
  suppliers: SupplierRepository,
  routeAuth: BusinessRouteAuth,
): void {
  app.get("/suppliers", { ...withPreHandlers(routeAuth.catalogRead) }, async (_req, reply) => {
    try {
      const list = await suppliers.listAll();
      return reply.send({ suppliers: list });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/suppliers", { ...withPreHandlers(routeAuth.batchCreate) }, async (req, reply) => {
    try {
      const body = createSupplierBodySchema.parse(req.body);
      const existing = await suppliers.findActiveByName(body.name);
      if (existing) {
        return reply.code(201).send({ supplier: existing });
      }
      const s = await suppliers.create(body.name, body.sortOrder ?? 0);
      return reply.code(201).send({ supplier: s });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete("/suppliers/:supplierId", { ...withPreHandlers(routeAuth.inventoryCatalogWrite) }, async (req, reply) => {
    try {
      const params = z.object({ supplierId: z.string().min(1) }).parse(req.params);
      const existing = await suppliers.findById(params.supplierId);
      if (!existing) {
        return reply.code(404).send({ error: "supplier_not_found" });
      }
      await suppliers.setActive(params.supplierId, false);
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
