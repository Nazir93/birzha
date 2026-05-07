import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  enqueue,
  loadOutbox,
  processSyncQueueSerialized,
  requestOutboxBackgroundSync,
  subscribeBackgroundSyncMessages,
  subscribeSyncOnOnline,
  type ProcessSyncResult,
} from "../sync/index.js";
import { randomUuid } from "../lib/random-uuid.js";
import { getOutboxScopeKey } from "../sync/outbox-scope.js";
import { useAuth } from "../auth/auth-context.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { btnStyleInline, errorText, preJson, warnText } from "../ui/styles.js";

const showDeveloperTools = import.meta.env.DEV;

/**
 * Блок «офлайн-очередь / sync» — вынесен, чтобы маршруты /o и /s использовали один сценарий.
 */
export function OfflineQueuePanel() {
  const { meta } = useAuth();
  const [queueTick, setQueueTick] = useState(0);
  const refreshQueue = useCallback(() => setQueueTick((t) => t + 1), []);

  const outboxQuery = useQuery({
    queryKey: ["outbox", queueTick, getOutboxScopeKey()],
    queryFn: () => loadOutbox(),
  });

  const [lastSync, setLastSync] = useState<ProcessSyncResult | null>(null);

  useEffect(() => {
    return subscribeSyncOnOnline({
      periodicIntervalMs: 120_000,
      onResult: (result) => {
        setLastSync(result);
        refreshQueue();
      },
    });
  }, [refreshQueue]);

  useEffect(() => {
    return subscribeBackgroundSyncMessages({
      onResult: (result) => {
        setLastSync(result);
        refreshQueue();
      },
    });
  }, [refreshQueue]);

  const syncMutation = useMutation({
    mutationFn: () => processSyncQueueSerialized(),
    onSuccess: (result) => {
      setLastSync(result);
      refreshQueue();
    },
    onError: () => {
      setLastSync(null);
    },
  });

  const handleEnqueueDemo = () => {
    void (async () => {
      await enqueue({
        actionType: "create_trip",
        payload: {
          id: `ui-trip-${randomUuid()}`,
          tripNumber: `О-${String(Date.now() % 1_000_000).padStart(6, "0")}`,
        },
      });
      void requestOutboxBackgroundSync();
      refreshQueue();
      setLastSync(null);
    })();
  };

  const syncEnabled = meta?.syncApi === "enabled";

  return (
    <BirzhaDisclosure
      defaultOpen
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-heading__eyebrow">Офлайн</span>
          <span id="offline-heading" className="birzha-section-title">
            Неотправленные действия
          </span>
        </span>
      }
      hint={
        <>
          В очереди:{" "}
          <strong id="offline-queue-count">{outboxQuery.data?.length ?? (outboxQuery.isLoading ? "…" : 0)}</strong>
        </>
      }
    >
      <p className="birzha-callout-info" style={{ margin: "0.5rem 0" }}>
        Действия отправятся при появлении сети.
      </p>
      {outboxQuery.isSuccess && (outboxQuery.data?.length ?? 0) === 0 && (
        <BirzhaEmptyState
          compact
          title="Очередь пуста"
          description="Новые действия из офлайн-режима появятся здесь до отправки на сервер."
        />
      )}
      {!syncEnabled && meta && (
        <p style={{ ...warnText, margin: "0.5rem 0" }}>
          Синхронизация временно недоступна на сервере. Проверьте связь или обратитесь к администратору.
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
        {showDeveloperTools && (
          <button type="button" style={btnStyleInline} onClick={handleEnqueueDemo}>
            Dev: добавить тестовое действие
          </button>
        )}
        <button
          type="button"
          style={btnStyleInline}
          disabled={syncMutation.isPending}
          aria-busy={syncMutation.isPending ? true : undefined}
          onClick={() => syncMutation.mutate()}
        >
          {syncMutation.isPending ? "Синхронизация…" : "Синхронизировать"}
        </button>
      </div>
      {lastSync && (
        <>
          {lastSync.stoppedReason === "rejected" && lastSync.lastSync?.status === "rejected" && (
            <p
              role="status"
              aria-live="polite"
              className="birzha-callout-warning"
              style={{ marginTop: "0.75rem", marginBottom: 0 }}
            >
              Сервер отклонил действие: <strong>{lastSync.lastSync.reason}</strong>. {lastSync.lastSync.resolution}
            </p>
          )}
          {lastSync.stoppedReason === "network_error" && (
            <p role="alert" style={{ ...errorText, marginTop: "0.75rem", marginBottom: 0 }}>
              Синхронизация не выполнена{lastSync.httpStatus != null ? ` (HTTP ${lastSync.httpStatus})` : ""}. Проверьте
              сеть и повторите.
            </p>
          )}
          {lastSync.stoppedReason === "unauthorized" && (
            <p role="alert" style={{ ...errorText, marginTop: "0.75rem", marginBottom: 0 }}>
              Сессия истекла или вход не выполнен. Войдите заново, затем повторите синхронизацию.
            </p>
          )}
          {showDeveloperTools && (
            <pre
              style={{ ...preJson, marginTop: "0.75rem" }}
              tabIndex={0}
              aria-label="Технический результат последней синхронизации, JSON"
            >
              {JSON.stringify(lastSync, null, 2)}
            </pre>
          )}
        </>
      )}
      {syncMutation.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.5rem" }}>
          Ошибка вызова синхронизации.
        </p>
      )}
    </BirzhaDisclosure>
  );
}
