import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { defaultRouteForUser } from "./auth/role-panels.js";
import { useAuth } from "./auth/auth-context.js";
import { AppNav } from "./components/AppNav.js";
import { CreateTripForm } from "./components/CreateTripForm.js";
import { LoginPage } from "./components/LoginPage.js";
import { OperationsPanel } from "./components/OperationsPanel.js";
import { PurchaseNakladnayaSection } from "./components/PurchaseNakladnayaSection.js";
import { RequireApiAuthGate } from "./components/RequireApiAuthGate.js";
import { RequirePanel } from "./components/RequirePanel.js";
import { TripReportPanel } from "./components/TripReportPanel.js";
import { routes } from "./routes.js";
import {
  enqueue,
  loadOutbox,
  processSyncQueueSerialized,
  requestOutboxBackgroundSync,
  subscribeBackgroundSyncMessages,
  subscribeSyncOnOnline,
  type ProcessSyncResult,
} from "./sync/index.js";
import { randomUuid } from "./lib/random-uuid.js";
import { getOutboxScopeKey } from "./sync/outbox-scope.js";
import { btnStyleInline, errorText, muted, preJson, sectionCard, warnText } from "./ui/styles.js";

function HomeRedirect() {
  const { ready, meta, user } = useAuth();
  if (!ready) {
    return (
      <p role="status" aria-live="polite">
        Загрузка…
      </p>
    );
  }
  const to = meta?.authApi === "enabled" && user ? defaultRouteForUser(user) : routes.reports;
  return <Navigate to={to} replace />;
}

export function App() {
  const { meta, bootstrapError } = useAuth();
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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 880 }}>
      <h1 className="no-print" style={{ marginTop: 0 }}>
        Биржа
      </h1>
      {import.meta.env.DEV ? (
        <p className="no-print" style={muted}>
          Клиент: Vite + React + TanStack Query + React Router. API: <code>pnpm dev:api</code> на порту 3000, в dev —
          прокси <code>/api/…</code>.
        </p>
      ) : null}

      <div className="no-print">
        <AppNav />
      </div>

      <Routes>
        <Route path={routes.login} element={<LoginPage />} />
        <Route element={<RequireApiAuthGate />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path={routes.reports}
            element={
              <RequirePanel panel="reports">
                <section style={sectionCard}>
                  <div className="no-print">
                    <CreateTripForm />
                  </div>
                  <TripReportPanel />
                </section>
              </RequirePanel>
            }
          />
          <Route
            path={routes.purchaseNakladnaya}
            element={
              <RequirePanel panel="nakladnaya">
                <section style={sectionCard}>
                  <PurchaseNakladnayaSection />
                </section>
              </RequirePanel>
            }
          />
          <Route
            path={routes.operations}
            element={
              <RequirePanel panel="operations">
                <section style={sectionCard}>
                  <OperationsPanel />
                </section>
              </RequirePanel>
            }
          />
          <Route
            path={routes.service}
            element={
              <RequirePanel panel="service">
                <section style={sectionCard} aria-labelledby="service-heading">
                <h2 id="service-heading" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
                  GET /api/meta
                </h2>
                {bootstrapError && (
                  <p role="alert" style={errorText}>
                    Нет ответа — запустите API.
                  </p>
                )}
                {!bootstrapError && meta && (
                  <pre style={preJson} tabIndex={0} aria-label="JSON ответа GET /api/meta">
                    {JSON.stringify(meta, null, 2)}
                  </pre>
                )}
              </section>
              </RequirePanel>
            }
          />
          <Route
            path={routes.offline}
            element={
              <RequirePanel panel="offline">
                <section style={sectionCard} aria-labelledby="offline-heading">
                <strong id="offline-heading">Офлайн-очередь → POST /api/sync</strong>
                <p style={{ ...muted, margin: "0.5rem 0" }}>
                  Очередь в браузере — <strong>IndexedDB</strong> (однократная миграция из <code>localStorage</code>); в
                  среде без IDB — память / <code>localStorage</code>. Отправка по одному запросу. При появлении сети и при
                  возврате на вкладку выполняется автоматическая попытка синка (тот же конвейер, что и по кнопке); пока
                  вкладка открыта и есть сеть — дополнительно раз в ~2 минуты. В поддерживаемых браузерах после добавления в
                  очередь запрашивается <strong>Background Sync</strong> (при срабатывании SW просит вкладку прогнать тот же
                  конвейер). При ответе <code>rejected</code> очередь
                  останавливается, первое действие не удаляется.
                </p>
                {!syncEnabled && meta && (
                  <p style={{ ...warnText, margin: "0.5rem 0" }}>
                    <code>syncApi</code> не enabled — эндпоинт <code>/sync</code> на сервере отключён (нужен полный контур
                    репозиториев). Кнопка всё равно шлёт запрос (удобно для отладки).
                  </p>
                )}
                <p style={{ margin: "0.35rem 0" }}>
                  В очереди:{" "}
                  <strong id="offline-queue-count">
                    {outboxQuery.data?.length ?? (outboxQuery.isLoading ? "…" : 0)}
                  </strong>
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button type="button" style={btnStyleInline} onClick={handleEnqueueDemo}>
                    Добавить в очередь (create_trip)
                  </button>
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
                      <p role="status" aria-live="polite" style={{ ...muted, marginTop: "0.75rem", marginBottom: 0 }}>
                        Сервер отклонил действие: <strong>{lastSync.lastSync.reason}</strong>. {lastSync.lastSync.resolution}
                      </p>
                    )}
                    {lastSync.stoppedReason === "network_error" && (
                      <p role="alert" style={{ ...errorText, marginTop: "0.75rem", marginBottom: 0 }}>
                        Запрос к <code>/api/sync</code> не выполнен
                        {lastSync.httpStatus != null ? ` (HTTP ${lastSync.httpStatus})` : ""}.
                      </p>
                    )}
                    <pre
                      style={{ ...preJson, marginTop: "0.75rem" }}
                      tabIndex={0}
                      aria-label="Результат последней синхронизации очереди, JSON"
                    >
                      {JSON.stringify(lastSync, null, 2)}
                    </pre>
                  </>
                )}
                {syncMutation.isError && (
                  <p role="alert" style={{ ...errorText, marginTop: "0.5rem" }}>
                    Ошибка вызова синхронизации.
                  </p>
                )}
              </section>
              </RequirePanel>
            }
          />
          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Routes>
    </main>
  );
}
