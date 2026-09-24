/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/],
  }),
);

/** Активация по запросу клиента (registerType: prompt); не вызывать skipWaiting при загрузке SW. */
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

clientsClaim();

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    if (event.data) {
      payload = event.data.json() as PushPayload;
    }
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title?.trim() || "Биржа";
  const body = payload.body?.trim() || "Новое событие";
  const url = payload.url?.trim() || "/a";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      lang: "ru",
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url?.trim() || "/a";
  const targetUrl = new URL(raw, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await (client as WindowClient).navigate(targetUrl);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
