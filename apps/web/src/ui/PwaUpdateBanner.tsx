import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Уведомление о новой версии после деплоя (registerType: prompt в vite-plugin-pwa).
 * «Офлайн готов» показываем коротко один раз — без навязчивости.
 */
export function PwaUpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  });

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
