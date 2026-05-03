import type { FastifyInstance } from "fastify";

import type { ApplySyncActionUseCase } from "../application/sync/apply-sync-action.use-case.js";
import { syncRequestSchema } from "../application/sync/sync-request.schema.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, userMayPerformSyncAction, withPreHandlers } from "./route-auth.js";

export function registerSyncRoutes(
  app: FastifyInstance,
  applySync: ApplySyncActionUseCase,
  routeAuth: BusinessRouteAuth,
): void {
  app.post("/sync", { ...withPreHandlers(routeAuth.sync) }, async (req, reply) => {
    try {
      const body = syncRequestSchema.parse(req.body);
      if (routeAuth.sync.length > 0) {
        const user = req.user as { roles: AuthRoleGrant[] };
        if (!userMayPerformSyncAction(user, body.actionType)) {
          return reply.code(200).send({
            status: "rejected",
            actionId: body.localActionId,
            reason: "Недостаточно прав для этого действия.",
            resolution:
              "Выйдите и войдите под учётной записью с нужной ролью или обратитесь к администратору. Удалите действие из очереди, если оно было создано по ошибке.",
            errorCode: "sync_forbidden",
            details: { actionType: body.actionType },
          });
        }
      }
      const u = req.user as { sub: string; roles: AuthRoleGrant[] } | undefined;
      const result = await applySync.execute(body, u ? { recordedByUserId: u.sub, roles: u.roles } : undefined);
      return reply.code(200).send(result);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
