import {
  createSellerFieldExpenseBodySchema,
  sellerFieldExpensesQuerySchema,
} from "@birzha/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { hasAnyGlobalRole } from "../auth/global-roles.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { isGlobalSellerOnly, tripVisibleToFieldSeller } from "../auth/seller-scope.js";
import { SellerFieldExpensesUseCase } from "../application/sale/seller-field-expenses.use-case.js";
import type { SellerFieldExpenseRepository } from "../application/ports/seller-field-expense-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import { calendarYmdFromDate, parseCalendarYmdUtcNoon } from "../format/calendar-date.js";

import { sendMappedError } from "./map-http-error.js";
import type { BusinessRouteAuth } from "./route-auth.js";
import { withPreHandlers } from "./route-auth.js";

type JwtRequestUser = { sub: string; login: string; roles: AuthRoleGrant[] };

function amountToBigInt(v: string | number): bigint {
  return BigInt(typeof v === "number" ? v : v);
}

function isAdminLike(roles: AuthRoleGrant[]): boolean {
  return hasAnyGlobalRole({ roles }, ["admin", "manager", "accountant"]);
}

export function registerSellerFieldExpenseRoutes(
  app: FastifyInstance,
  deps: {
    trips: TripRepository;
    sales: TripSaleRepository;
    expenses: SellerFieldExpenseRepository;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const uc = new SellerFieldExpensesUseCase(deps.trips, deps.expenses, deps.sales);

  app.get("/seller-field-expenses", { ...withPreHandlers(routeAuth.sellerFieldExpenseRead) }, async (req, reply) => {
    try {
      const q = sellerFieldExpensesQuerySchema.parse(req.query);
      const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      let recordedByUserId: string | undefined;
      if (user && isGlobalSellerOnly(user.roles)) {
        recordedByUserId = user.sub;
        if (q.tripId) {
          const trip = await deps.trips.findById(q.tripId);
          if (!trip || !tripVisibleToFieldSeller(trip, user.sub)) {
            return reply.code(403).send({ error: "forbidden" });
          }
        }
      }
      const result = await uc.list({
        tripId: q.tripId,
        fromYmd: q.from,
        toYmd: q.to,
        recordedByUserId,
        group: q.group,
      });
      return reply.send({
        expenses: result.expenses.map((e) => ({
          id: e.id,
          tripId: e.tripId,
          expenseDate: calendarYmdFromDate(e.expenseDate),
          category: e.category,
          amountKopecks: e.amountKopecks.toString(),
          comment: e.comment,
          recordedByUserId: e.recordedByUserId,
          createdAt: e.createdAt.toISOString(),
        })),
        groups: result.groups.map((g) => ({
          key: g.key,
          label: g.label,
          fromYmd: g.fromYmd,
          toYmd: g.toYmd,
          totalKopecks: g.totalKopecks.toString(),
          count: g.count,
        })),
        settlement: {
          cashKopecks: result.settlement.cashKopecks.toString(),
          cardTransferKopecks: result.settlement.cardTransferKopecks.toString(),
          debtKopecks: result.settlement.debtKopecks.toString(),
          fieldExpensesKopecks: result.settlement.fieldExpensesKopecks.toString(),
          cashToHandOverKopecks: result.settlement.cashToHandOverKopecks.toString(),
        },
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/seller-field-expenses", { ...withPreHandlers(routeAuth.sellerFieldExpenseWrite) }, async (req, reply) => {
    try {
      const body = createSellerFieldExpenseBodySchema.parse(req.body);
      const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (user && isGlobalSellerOnly(user.roles)) {
        const trip = await deps.trips.findById(body.tripId);
        if (!trip || !tripVisibleToFieldSeller(trip, user.sub)) {
          return reply.code(403).send({ error: "forbidden" });
        }
      }
      const row = await uc.record({
        tripId: body.tripId,
        expenseDate: parseCalendarYmdUtcNoon(body.expenseDate),
        category: body.category,
        amountKopecks: amountToBigInt(body.amountKopecks),
        comment: body.comment,
        recordedByUserId: user?.sub ?? null,
      });
      return reply.code(201).send({
        id: row.id,
        tripId: row.tripId,
        expenseDate: calendarYmdFromDate(row.expenseDate),
        category: row.category,
        amountKopecks: row.amountKopecks.toString(),
        comment: row.comment,
        recordedByUserId: row.recordedByUserId,
        createdAt: row.createdAt.toISOString(),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/seller-field-expenses/:expenseId",
    { ...withPreHandlers(routeAuth.sellerFieldExpenseWrite) },
    async (req, reply) => {
      try {
        const { expenseId } = z.object({ expenseId: z.string().min(1) }).parse(req.params);
        const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
        const adminLike = user ? isAdminLike(user.roles) : true;
        await uc.delete({
          expenseId,
          actorUserId: user?.sub ?? null,
          isAdminLike: adminLike,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
