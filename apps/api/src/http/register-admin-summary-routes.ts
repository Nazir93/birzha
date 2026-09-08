import type { FastifyInstance } from "fastify";

import { globalRoleCodes } from "../auth/global-roles.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { DbClient } from "../db/client.js";
import {
  adminDashboardSummaryQuerySchema,
  getAdminDashboardSummary,
} from "./admin-dashboard-summary-http.js";
import { sendMappedError } from "./map-http-error.js";
import {
  getPurchaseByPurchaserReport,
  purchaseByPurchaserReportQuerySchema,
} from "./purchase-by-purchaser-report.js";
import { getStockBalancesSummary } from "./stock-balances-http.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtUser = { sub: string; roles: AuthRoleGrant[] };

/** У purchaser без руководства отчёт только по своим накладным. */
function purchaseByPurchaserSelfScopeUserId(user: JwtUser | undefined): string | undefined {
  if (!user?.sub) {
    return undefined;
  }
  const globals = globalRoleCodes(user);
  if (globals.includes("admin") || globals.includes("manager")) {
    return undefined;
  }
  if (globals.includes("purchaser")) {
    return user.sub;
  }
  return undefined;
}

export function registerAdminSummaryRoutes(
  app: FastifyInstance,
  db: DbClient,
  routeAuth: BusinessRouteAuth,
): void {
  app.get(
    "/admin/dashboard-summary",
    { ...withPreHandlers(routeAuth.dashboardSummaryRead) },
    async (req, reply) => {
      try {
        const query = adminDashboardSummaryQuerySchema.parse(req.query);
        const summary = await getAdminDashboardSummary(db, query);
        return reply.send(summary);
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  /** Отчёт «закупщик × склад» за период; purchaser — только свои накладные. */
  app.get(
    "/admin/purchase-by-purchaser",
    { ...withPreHandlers(routeAuth.purchasePurchaserReportRead) },
    async (req, reply) => {
      try {
        const query = purchaseByPurchaserReportQuerySchema.parse(req.query);
        const user = req.user as JwtUser | undefined;
        const onlyPurchaserUserId = purchaseByPurchaserSelfScopeUserId(user);
        const report = await getPurchaseByPurchaserReport(
          db,
          query,
          onlyPurchaserUserId ? { onlyPurchaserUserId } : undefined,
        );
        return reply.send(report);
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.get("/stock-balances", { ...withPreHandlers(routeAuth.dataRead) }, async (_req, reply) => {
    try {
      const summary = await getStockBalancesSummary(db);
      return reply.send(summary);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
