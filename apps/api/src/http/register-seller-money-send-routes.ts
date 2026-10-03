import { createSellerMoneySendBodySchema, sellerMoneySendsQuerySchema } from "@birzha/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { hasAnyGlobalRole } from "../auth/global-roles.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { isGlobalSellerOnly } from "../auth/seller-scope.js";
import type { SellerMoneySendRepository } from "../application/ports/seller-money-send-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import { SellerMoneySendsUseCase } from "../application/sale/seller-money-sends.use-case.js";

import { sendMappedError } from "./map-http-error.js";
import type { BusinessRouteAuth } from "./route-auth.js";
import { withPreHandlers } from "./route-auth.js";

type JwtRequestUser = { sub: string; login: string; roles: AuthRoleGrant[] };

function parseYmdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function amountToBigInt(v: string | number): bigint {
  return BigInt(typeof v === "number" ? v : v);
}

function isAdminLike(roles: AuthRoleGrant[]): boolean {
  return hasAnyGlobalRole({ roles }, ["admin", "manager", "accountant"]);
}

export function registerSellerMoneySendRoutes(
  app: FastifyInstance,
  deps: {
    trips: TripRepository;
    sends: SellerMoneySendRepository;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const uc = new SellerMoneySendsUseCase(deps.sends, deps.trips);

  app.get("/seller-money-sends", { ...withPreHandlers(routeAuth.sellerMoneySendRead) }, async (req, reply) => {
    try {
      const q = sellerMoneySendsQuerySchema.parse(req.query);
      const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      let recordedByUserId: string | undefined;
      if (user && isGlobalSellerOnly(user.roles)) {
        recordedByUserId = user.sub;
      }
      const result = await uc.list({
        fromYmd: q.from,
        toYmd: q.to,
        tripId: q.tripId,
        recordedByUserId,
      });
      return reply.send({
        totalKopecks: result.totalKopecks.toString(),
        sends: result.sends.map((s) => ({
          id: s.id,
          tripId: s.tripId,
          sendDate: s.sendDate.toISOString().slice(0, 10),
          amountKopecks: s.amountKopecks.toString(),
          recipient: s.recipient,
          comment: s.comment,
          recordedByUserId: s.recordedByUserId,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/seller-money-sends", { ...withPreHandlers(routeAuth.sellerMoneySendWrite) }, async (req, reply) => {
    try {
      const body = createSellerMoneySendBodySchema.parse(req.body);
      const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      const row = await uc.record({
        tripId: body.tripId,
        sendDate: parseYmdToUtcDate(body.sendDate),
        amountKopecks: amountToBigInt(body.amountKopecks),
        recipient: body.recipient,
        comment: body.comment,
        recordedByUserId: user?.sub ?? null,
      });
      return reply.code(201).send({
        id: row.id,
        tripId: row.tripId,
        sendDate: row.sendDate.toISOString().slice(0, 10),
        amountKopecks: row.amountKopecks.toString(),
        recipient: row.recipient,
        comment: row.comment,
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/seller-money-sends/:sendId",
    { ...withPreHandlers(routeAuth.sellerMoneySendWrite) },
    async (req, reply) => {
      try {
        const { sendId } = z.object({ sendId: z.string().min(1) }).parse(req.params);
        const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
        await uc.delete({
          sendId,
          actorUserId: user?.sub ?? null,
          isAdminLike: user ? isAdminLike(user.roles) : true,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
