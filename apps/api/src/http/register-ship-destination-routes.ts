import { createShipDestinationBodySchema } from "@birzha/contracts";
import type { FastifyInstance } from "fastify";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { ResourceInUseError } from "../application/errors.js";
import type { DbClient } from "../db/client.js";
import { loadingManifests, shipDestinations as shipDest, trips } from "../db/schema.js";
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
        const code = params.code.trim();
        const [existing] = await db.select().from(shipDest).where(eq(shipDest.code, code)).limit(1);
        if (!existing) {
          return reply.code(404).send({ error: "ship_destination_not_found" });
        }

        const [tripUse] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(trips)
          .where(eq(trips.destinationCode, code));
        const [manifestUse] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(loadingManifests)
          .where(eq(loadingManifests.destinationCode, code));
        const tripCount = Number(tripUse?.n ?? 0);
        const manifestCount = Number(manifestUse?.n ?? 0);
        if (tripCount > 0 || manifestCount > 0) {
          const parts: string[] = [];
          if (tripCount > 0) {
            parts.push(`рейсов: ${tripCount}`);
          }
          if (manifestCount > 0) {
            parts.push(`погрузочных: ${manifestCount}`);
          }
          throw new ResourceInUseError(
            "ship_destination",
            `Город «${existing.displayName}» (${code}) нельзя удалить — используется (${parts.join(", ")}). Сначала смените город у этих документов или оставьте код в справочнике.`,
          );
        }

        await db.delete(shipDest).where(eq(shipDest.code, code));
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
