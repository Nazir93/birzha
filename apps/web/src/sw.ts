/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import { BG_SYNC_RUN_OUTBOX_MESSAGE, OUTBOX_BACKGROUND_SYNC_TAG } from "./sync/background-sync-shared.js";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api/],
  }),
);

self.skipWaiting();
clientsClaim();

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag !== OUTBOX_BACKGROUND_SYNC_TAG) {
    return;
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: BG_SYNC_RUN_OUTBOX_MESSAGE });
      }
    })(),
  );
});
