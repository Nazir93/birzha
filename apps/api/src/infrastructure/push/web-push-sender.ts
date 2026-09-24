import webpush from "web-push";

import type { PushSubscriptionRecord } from "../../application/ports/push-subscription.port.js";

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type WebPushSender = {
  send(subscription: PushSubscriptionRecord, payload: WebPushPayload): Promise<"ok" | "gone">;
};

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function createWebPushSender(vapid: VapidConfig): WebPushSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  return {
    async send(subscription, payload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        return "ok";
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          return "gone";
        }
        throw error;
      }
    },
  };
}
