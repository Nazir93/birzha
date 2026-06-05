import type { FastifyInstance } from "fastify";

import type { DbClient } from "../db/client.js";
import {
  adminDashboardSummaryQuerySchema,
  getAdminDashboardSummary,
} from "./admin-dashboard-summary-http.js";
import { sendMappedError } from "./map-http-error.js";
import { getStockBalancesSummary } from "./stock-balances-http.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

export function registerAdminSummaryRoutes(
  app: FastifyInstance,
  db: DbClient,
  routeAuth: BusinessRouteAuth,
): void {
  app.get("/admin/dashboard-summary", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const query = adminDashboardSummaryQuerySchema.parse(req.query);
      const summary = await getAdminDashboardSummary(db, query);
      return reply.send(summary);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/stock-balances", { ...withPreHandlers(routeAuth.dataRead) }, async (_req, reply) => {
    try {
      const summary = await getStockBalancesSummary(db);
      return reply.send(summary);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
