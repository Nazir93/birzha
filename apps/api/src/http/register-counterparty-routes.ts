import type { FastifyInstance } from "fastify";
import { createCounterpartyBodySchema } from "@birzha/contracts";

import type { CounterpartyRepository } from "../application/ports/counterparty-repository.port.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerCounterpartyRoutes(
  app: FastifyInstance,
  counterparties: CounterpartyRepository,
  routeAuth: BusinessRouteAuth,
): void {
  app.get("/counterparties", { ...withPreHandlers(routeAuth.catalogRead) }, async (_req, reply) => {
    try {
      const list = await counterparties.listActive();
      return reply.send({ counterparties: list });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/counterparties", { ...withPreHandlers(routeAuth.catalogWrite) }, async (req, reply) => {
    try {
      const body = createCounterpartyBodySchema.parse(req.body);
      const c = await counterparties.create(body.displayName);
      return reply.code(201).send({ counterparty: c });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
