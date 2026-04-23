import type { FastifyInstance } from "fastify";
import { createCounterpartyBodySchema } from "@birzha/contracts";
import { z } from "zod";

import { DeleteCounterpartyUseCase } from "../application/counterparty/delete-counterparty.use-case.js";
import type { CounterpartyRepository } from "../application/ports/counterparty-repository.port.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerCounterpartyRoutes(
  app: FastifyInstance,
  deps: {
    counterparties: CounterpartyRepository;
    /** Продажи в рейсе; без него `DELETE` не регистрируется. */
    deleteCounterparty: DeleteCounterpartyUseCase | null;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const { counterparties, deleteCounterparty } = deps;
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

  if (deleteCounterparty) {
    const del = deleteCounterparty;
    app.delete(
      "/counterparties/:counterpartyId",
      { ...withPreHandlers(routeAuth.catalogWrite) },
      async (req, reply) => {
        try {
          const params = z.object({ counterpartyId: z.string().min(1) }).parse(req.params);
          await del.execute(params.counterpartyId);
          return reply.code(204).send();
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );
  }
}
