import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import {
  enqueue,
  loadOutbox,
  processSyncQueueSerialized,
  subscribeSyncOnOnline,
  type ProcessSyncResult,
} from "./sync/index.js";

type MetaResponse = {
  name: string;
  domain?: string;
  batchesApi: string;
  tripsApi: string;
  tripShipmentLedger: string;
  tripSaleLedger: string;
  tripShortageLedger: string;
  syncApi: string;
};

const sectionStyle: CSSProperties = {
  marginTop: "1.25rem",
  fontSize: "0.95rem",
  padding: "1rem",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fafafa",
};

const btnStyle: CSSProperties = {
  marginRight: "0.5rem",
  marginTop: "0.5rem",
  padding: "0.45rem 0.85rem",
  fontSize: "0.9rem",
  cursor: "pointer",
  borderRadius: 6,
  border: "1px solid #d4d4d8",
  background: "#fff",
};

export function App() {
  const [queueTick, setQueueTick] = useState(0);
  const refreshQueue = useCallback(() => setQueueTick((t) => t + 1), []);

  const outboxQuery = useQuery({
    queryKey: ["outbox", queueTick],
    queryFn: () => loadOutbox(),
  });

  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: async (): Promise<MetaResponse> => {
      const res = await fetch("/api/meta");
      if (!res.ok) {
        throw new Error(`meta ${res.status}`);
      }
      return res.json() as Promise<MetaResponse>;
    },
    retry: 1,
  });

  const [lastSync, setLastSync] = useState<ProcessSyncResult | null>(null);

  useEffect(() => {
    return subscribeSyncOnOnline({
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
          id: `ui-trip-${crypto.randomUUID()}`,
          tripNumber: `О-${String(Date.now() % 1_000_000).padStart(6, "0")}`,
        },
      });
      refreshQueue();
      setLastSync(null);
    })();
  };

  const syncEnabled = meta.data?.syncApi === "enabled";

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Биржа</h1>
      <p style={{ color: "#52525b" }}>
        Клиент: Vite + React + TanStack Query. API: <code>pnpm dev:api</code> на порту 3000.
      </p>
      <p style={{ color: "#52525b" }}>
        В dev запросы идут на <code>/api/…</code> (прокси в vite.config.ts).
      </p>

      <section style={sectionStyle}>
        <strong>GET /api/meta</strong>
        {meta.isPending && <p>Загрузка…</p>}
        {meta.isError && <p>Нет ответа — запустите API.</p>}
        {meta.data && (
          <pre
            style={{
              margin: "0.5rem 0 0",
              padding: "0.75rem",
              background: "#f4f4f5",
              borderRadius: 6,
              overflow: "auto",
            }}
          >
            {JSON.stringify(meta.data, null, 2)}
          </pre>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Офлайн-очередь → POST /api/sync</strong>
        <p style={{ margin: "0.5rem 0", color: "#52525b" }}>
          Очередь в браузере — <strong>IndexedDB</strong> (однократная миграция из <code>localStorage</code>); в
          среде без IDB — память / <code>localStorage</code>. Отправка по одному запросу. При появлении сети и при
          возврате на вкладку выполняется автоматическая попытка синка (тот же конвейер, что и по кнопке). При ответе{" "}
          <code>rejected</code> очередь останавливается, первое действие не удаляется.
        </p>
        {!syncEnabled && meta.data && (
          <p style={{ color: "#b45309", margin: "0.5rem 0" }}>
            <code>syncApi</code> не enabled — эндпоинт <code>/sync</code> на сервере отключён (нужен полный контур репозиториев). Кнопка всё равно шлёт запрос (удобно для отладки).
          </p>
        )}
        <p style={{ margin: "0.35rem 0" }}>
          В очереди: <strong>{outboxQuery.data?.length ?? (outboxQuery.isLoading ? "…" : 0)}</strong>
        </p>
        <div>
          <button type="button" style={btnStyle} onClick={handleEnqueueDemo}>
            Добавить в очередь (create_trip)
          </button>
          <button
            type="button"
            style={btnStyle}
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending ? "Синхронизация…" : "Синхронизировать"}
          </button>
        </div>
        {lastSync && (
          <pre
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              background: "#f4f4f5",
              borderRadius: 6,
              fontSize: "0.85rem",
            }}
          >
            {JSON.stringify(lastSync, null, 2)}
          </pre>
        )}
        {syncMutation.isError && (
          <p style={{ color: "#b91c1c", marginTop: "0.5rem" }}>Ошибка вызова синхронизации.</p>
        )}
      </section>
    </main>
  );
}
