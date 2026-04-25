import { createShipDestinationBodySchema } from "@birzha/contracts";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import { shipDestinations as shipDest } from "../db/schema.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerShipDestinationRoutes(
  app: FastifyInstance,
  db: DbClient,
  routeAuth: BusinessRouteAuth,
): void {
  app.get(
    "/ship-destinations",
    { ...withPreHandlers(routeAuth.dataRead) },
    async (_req, reply) => {
      try {
        const rows = await db
          .select()
          .from(shipDest)
          .orderBy(asc(shipDest.sortOrder), asc(shipDest.code));
        return reply.send({ shipDestinations: rows });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.post(
    "/ship-destinations",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const body = createShipDestinationBodySchema.parse(req.body);
        const code = body.code.trim();
        const displayName = body.displayName.trim();
        const sortOrder = body.sortOrder ?? 0;
        await db
          .insert(shipDest)
          .values({ code, displayName, sortOrder, isActive: true })
          .onConflictDoUpdate({
            target: shipDest.code,
            set: { displayName, sortOrder, isActive: true },
          });
        return reply.code(201).send({ ok: true });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.delete(
    "/ship-destinations/:code",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ code: z.string().min(1).max(64) }).parse(req.params);
        const [existing] = await db
          .select()
          .from(shipDest)
          .where(eq(shipDest.code, params.code))
          .limit(1);
        if (!existing) {
          return reply.code(404).send({ error: "ship_destination_not_found" });
        }
        await db.update(shipDest).set({ isActive: false }).where(eq(shipDest.code, params.code));
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}

/**
 * `destination` в PATCH allocation должен ссылаться на активную строку справочника (если не null).
 */
export async function assertActiveShipDestination(
  db: DbClient,
  destination: string,
): Promise<boolean> {
  const [row] = await db
    .select({ code: shipDest.code })
    .from(shipDest)
    .where(and(eq(shipDest.code, destination), eq(shipDest.isActive, true)))
    .limit(1);
  return row != null;
}
