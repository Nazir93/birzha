import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { pushSubscribeBodySchema } from "@birzha/contracts";

import type { PushSubscriptionRepository } from "../application/ports/push-subscription.port.js";
import type { AppEnv } from "../config.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

function jwtSub(req: FastifyRequest): string {
  return String((req.user as { sub?: string }).sub ?? "");
}

export function registerPushRoutes(
  app: FastifyInstance,
  opts: {
    env: AppEnv;
    routeAuth: BusinessRouteAuth;
    subscriptions: PushSubscriptionRepository | null;
  },
): void {
  const vapidPublic = opts.env.VAPID_PUBLIC_KEY?.trim() || "";
  const pushEnabled = Boolean(vapidPublic && opts.env.VAPID_PRIVATE_KEY?.trim() && opts.subscriptions);

  app.get("/push/vapid-public-key", { ...withPreHandlers(opts.routeAuth.userManagement) }, async (_req, reply) => {
    if (!pushEnabled) {
      return reply.code(503).send({ error: "push_not_configured" });
    }
    return reply.send({ publicKey: vapidPublic });
  });

  app.post("/push/subscribe", { ...withPreHandlers(opts.routeAuth.userManagement) }, async (req, reply) => {
    try {
      if (!pushEnabled || !opts.subscriptions) {
        return reply.code(503).send({ error: "push_not_configured" });
      }
      const body = pushSubscribeBodySchema.parse(req.body);
      const userId = jwtSub(req);
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const uaHeader = req.headers["user-agent"];
      const userAgent = typeof uaHeader === "string" ? uaHeader.slice(0, 500) : null;
      await opts.subscriptions.upsert({
        endpoint: body.endpoint,
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete("/push/subscribe", { ...withPreHandlers(opts.routeAuth.userManagement) }, async (req, reply) => {
    try {
      if (!pushEnabled || !opts.subscriptions) {
        return reply.code(503).send({ error: "push_not_configured" });
      }
      const body = z.object({ endpoint: z.string().min(1).max(2048) }).parse(req.body);
      const userId = jwtSub(req);
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      await opts.subscriptions.deleteByEndpointForUser(body.endpoint, userId);
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
