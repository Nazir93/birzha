import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  enqueue,
  loadOutbox,
  processSyncQueueSerialized,
  requestOutboxBackgroundSync,
  type ProcessSyncResult,
} from "../sync/index.js";
import { announceSyncProcessResult } from "../sync/announce-sync-process-result.js";
import { getOutboxScopeKey } from "../sync/outbox-scope.js";
import { BIRZHA_SYNC_RESULT_EVENT } from "../sync/sync-result-events.js";
import { useAuth } from "../auth/auth-context.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { btnStyleInline, errorText, preJson, warnText } from "../ui/styles.js";
import { randomUuid } from "../lib/random-uuid.js";

const showDeveloperTools = import.meta.env.DEV;

/**
 * Блок «офлайн-очередь / sync» — вынесен, чтобы маршруты /o и /s использовали один сценарий.
 */
export function OfflineQueuePanel() {
  const { meta } = useAuth();
  const queryClient = useQueryClient();

  const outboxQuery = useQuery({
    queryKey: ["outbox", getOutboxScopeKey()],
    queryFn: () => loadOutbox(),
  });

  const [lastSync, setLastSync] = useState<ProcessSyncResult | null>(null);

  useEffect(() => {
    const onSyncResult = (ev: Event) => {
      const ce = ev as CustomEvent<ProcessSyncResult>;
      if (ce.detail) {
        setLastSync(ce.detail);
      }
    };
    window.addEventListener(BIRZHA_SYNC_RESULT_EVENT, onSyncResult);
    return () => window.removeEventListener(BIRZHA_SYNC_RESULT_EVENT, onSyncResult);
  }, []);

  const syncMutation = useMutation({
    mutationFn: () => processSyncQueueSerialized(),
    onSuccess: (result) => {
      announceSyncProcessResult(queryClient, result);
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
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
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
