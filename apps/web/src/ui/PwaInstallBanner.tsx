import { useCallback, useEffect, useState } from "react";

const STORAGE_DISMISS = "birzha_pwa_install_dismiss_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** Chromium: событие до показа системного диалога установки. */
type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<{ outcome: string }>;
};

/** iOS Safari: признак добавления на экран «Домой». */
function isIosStandalone(): boolean {
  return (
    ("standalone" in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isIosNotStandalone(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  return isIos && !isIosStandalone();
}

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isIosStandalone()) {
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_DISMISS);
      if (raw) {
        const until = Number.parseInt(raw, 10);
        if (Number.isFinite(until) && Date.now() < until) {
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setDismissed(false);
    if (isIosNotStandalone()) {
      setShowIosHint(true);
    }
  }, []);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEventLike);
      setShowIosHint(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_DISMISS, String(Date.now() + DISMISS_MS));
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setShowIosHint(false);
    setDeferred(null);
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferred) {
      return;
    }
    try {
      await deferred.prompt();
    } finally {
      dismiss();
    }
  }, [deferred, dismiss]);

  if (dismissed || isIosStandalone()) {
    return null;
  }

  const showChromeInstall = Boolean(deferred);
  const showBanner = showChromeInstall || showIosHint;

  if (!showBanner) {
    return null;
  }

  return (
    <div
      className="birzha-pwa-install no-print"
      role="region"
      aria-label="Установка приложения"
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        zIndex: 10000,
        maxWidth: 440,
        marginLeft: "auto",
        marginRight: "auto",
        padding: "0.65rem 0.85rem",
        borderRadius: 10,
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        background: "var(--birzha-surface)",
        border: "1px solid var(--color-border)",
        fontSize: "0.88rem",
        lineHeight: 1.45,
      }}
    >
      {showChromeInstall ? (
        <>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>Биржа</strong> — можно установить как приложение: ярлык на рабочий стол и быстрый запуск.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" className="birzha-btn-primary" onClick={() => void onInstallClick()}>
              Установить
            </button>
            <button type="button" className="birzha-btn-ghost" onClick={dismiss}>
              Не сейчас
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>На iPhone/iPad:</strong> нажмите «Поделиться» (□↑) в Safari, затем «На экран «Домой»», чтобы закрепить
            приложение.
          </p>
          <button type="button" className="birzha-btn-ghost" onClick={dismiss}>
            Понятно
          </button>
        </>
      )}
    </div>
  );
}
