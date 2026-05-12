import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { announceSyncProcessResult } from "./announce-sync-process-result.js";
import type { ProcessSyncResult } from "./process-sync-queue.js";
import { subscribeBackgroundSyncMessages } from "./subscribe-background-sync-messages.js";
import { subscribeSyncOnOnline } from "./subscribe-sync-on-online.js";

/**
 * Один раз на приложение: фоновая отправка очереди при сети / SW и обновление кэша React Query.
 * Раньше подписки жили только в `OfflineQueuePanel` — без захода на «Офлайн» очередь не уходила.
 */
export function GlobalOutboxSyncSubscriber(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onResult = (result: ProcessSyncResult) => {
      announceSyncProcessResult(queryClient, result);
    };
    const unsubOnline = subscribeSyncOnOnline({
      periodicIntervalMs: 120_000,
      onResult,
    });
    const unsubBg = subscribeBackgroundSyncMessages({ onResult });
    return () => {
      unsubOnline();
      unsubBg();
    };
  }, [queryClient]);

  return null;
}
