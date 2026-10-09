type ApplyPwaUpdateOptions = {
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  /** Текущая регистрация SW (waiting.postMessage — запасной путь). */
  registration?: ServiceWorkerRegistration;
  reload?: () => void;
  /** Если controlling не пришёл — принудительный reload. */
  fallbackMs?: number;
  /** Для тестов: подписка на controllerchange. */
  onControllerChange?: (listener: () => void) => void;
  /** Для тестов: таймер fallback. */
  scheduleFallback?: (fn: () => void, ms: number) => void;
};

/**
 * Активирует ожидающий service worker и перезагружает страницу.
 * vite-plugin-pwa сам reload делает только на `controlling`+isUpdate — часто молчит.
 */
export async function applyPwaUpdate(options: ApplyPwaUpdateOptions): Promise<void> {
  const reload = options.reload ?? (() => {
    window.location.reload();
  });
  let done = false;
  const reloadOnce = () => {
    if (done) {
      return;
    }
    done = true;
    reload();
  };

  const onControllerChange =
    options.onControllerChange ??
    ((listener: () => void) => {
      navigator.serviceWorker.addEventListener("controllerchange", listener, { once: true });
    });
  onControllerChange(reloadOnce);

  const fallbackMs = options.fallbackMs ?? 1200;
  const scheduleFallback =
    options.scheduleFallback ??
    ((fn: () => void, ms: number) => {
      window.setTimeout(fn, ms);
    });
  scheduleFallback(reloadOnce, fallbackMs);

  try {
    await options.updateServiceWorker(true);
  } catch {
    /* reload всё равно через controllerchange / fallback */
  }

  const waiting =
    options.registration?.waiting ??
    (typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? (await navigator.serviceWorker.getRegistration())?.waiting
      : undefined);
  waiting?.postMessage({ type: "SKIP_WAITING" });
}
