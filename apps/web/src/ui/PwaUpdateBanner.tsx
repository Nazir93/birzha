import { useMemo, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { useSwPeriodicUpdate } from "../pwa/use-sw-periodic-update.js";

/**
 * Регистрация service worker и баннер «Доступна новая версия» (registerType: prompt).
 * Без офлайн-очереди: обновление только статики приложения после деплоя.
 */
export function PwaUpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW(
    useMemo(
      () => ({
        immediate: true as const,
        onRegistered(reg: ServiceWorkerRegistration | undefined) {
          setRegistration(reg);
          if (reg) {
            void reg.update();
          }
        },
        onRegisterError(error: unknown) {
          console.error("[PWA] регистрация service worker:", error);
        },
      }),
      [],
    ),
  );

  useSwPeriodicUpdate(registration);

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="birzha-pwa-toast no-print" role="status" aria-live="polite">
      <p className="birzha-pwa-toast__text">
        Доступна новая версия. Обновите, чтобы получить последние изменения.
      </p>
      <div className="birzha-pwa-toast__actions">
        <button type="button" className="birzha-btn-primary" onClick={() => void updateServiceWorker(true)}>
          Обновить
        </button>
        <button type="button" className="birzha-btn-ghost" onClick={() => setNeedRefresh(false)}>
          Позже
        </button>
      </div>
    </div>
  );
}
