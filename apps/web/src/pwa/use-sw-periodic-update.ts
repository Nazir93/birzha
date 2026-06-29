import { useEffect } from "react";

const UPDATE_INTERVAL_MS = 3 * 60 * 1000;

/** Периодически и при возврате во вкладку проверяем новую сборку SW (после деплоя). */
export function useSwPeriodicUpdate(registration: ServiceWorkerRegistration | undefined) {
  useEffect(() => {
    if (!registration) {
      return;
    }

    const check = () => {
      void registration.update();
    };

    check();

    const intervalId = window.setInterval(check, UPDATE_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
    };
  }, [registration]);
}
