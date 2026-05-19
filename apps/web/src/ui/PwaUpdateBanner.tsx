import { useEffect, useMemo, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Периодический опрос новой сборки SW (полевые продавцы держат PWA открытой часами). */
const SW_VERSION_CHECK_MS = 3 * 60 * 1000;

function checkForSwUpdate(registration: ServiceWorkerRegistration) {
  void registration.update();
}

/**
 * Уведомление о новой версии после деплоя (registerType: prompt в vite-plugin-pwa).
 * «Офлайн готов» показываем коротко один раз — без навязчивости.
 */
export function PwaUpdateBanner() {
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const swCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onAppForeground = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const r = swRegistrationRef.current;
      if (r) {
        checkForSwUpdate(r);
      }
    };

    document.addEventListener("visibilitychange", onAppForeground);
    window.addEventListener("focus", onAppForeground);
    window.addEventListener("pageshow", onAppForeground);

    return () => {
      if (swCheckIntervalRef.current != null) {
        clearInterval(swCheckIntervalRef.current);
        swCheckIntervalRef.current = null;
      }
      swRegistrationRef.current = null;
      document.removeEventListener("visibilitychange", onAppForeground);
      window.removeEventListener("focus", onAppForeground);
      window.removeEventListener("pageshow", onAppForeground);
    };
  }, []);

  const registerSwOptions = useMemo(
    () => ({
      immediate: true as const,
      onRegistered(r: ServiceWorkerRegistration | undefined) {
        if (!r) {
          return;
        }
        swRegistrationRef.current = r;
        checkForSwUpdate(r);
        if (swCheckIntervalRef.current != null) {
          clearInterval(swCheckIntervalRef.current);
        }
        swCheckIntervalRef.current = setInterval(() => checkForSwUpdate(r), SW_VERSION_CHECK_MS);
      },
    }),
    [],
  );

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW(registerSwOptions);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  const dismissOffline = () => setOfflineReady(false);
  const dismissRefresh = () => setNeedRefresh(false);

  return (
    <div
      className="birzha-pwa-toast no-print"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "max(12px, env(safe-area-inset-bottom))",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        zIndex: 9999,
        maxWidth: 420,
        marginLeft: "auto",
        marginRight: "auto",
        padding: "0.65rem 0.85rem",
        borderRadius: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        background: "var(--birzha-surface)",
        border: "1px solid rgba(0,0,0,0.08)",
        fontSize: "0.9rem",
        lineHeight: 1.4,
      }}
    >
      {needRefresh ? (
        <>
          <p style={{ margin: "0 0 0.5rem" }}>
            Доступна новая версия приложения. Обновите страницу, чтобы получить последние изменения.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" className="birzha-btn-primary" onClick={() => void updateServiceWorker(true)}>
              Обновить
            </button>
            <button type="button" className="birzha-btn-ghost" onClick={dismissRefresh}>
              Позже
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 0.5rem" }}>Приложение готово к работе без сети для уже загруженных страниц.</p>
          <button type="button" className="birzha-btn-ghost" onClick={dismissOffline}>
            Понятно
          </button>
        </>
      )}
    </div>
  );
}
