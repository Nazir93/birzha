import { useMemo } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Регистрация service worker без баннера.
 * `registerType: autoUpdate` в vite — после деплоя страница сама перезагрузится с новой сборкой.
 */
export function PwaUpdateBanner() {
  useRegisterSW(
    useMemo(
      () => ({
        immediate: true as const,
        onRegistered(registration: ServiceWorkerRegistration | undefined) {
          if (registration) {
            void registration.update();
          }
        },
      }),
      [],
    ),
  );
  return null;
}
