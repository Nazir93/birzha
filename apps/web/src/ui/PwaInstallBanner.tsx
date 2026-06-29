import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { isIosSafariNotStandalone, isPwaStandalone, isSellerCabinetPath } from "../pwa/pwa-display-mode.js";

const STORAGE_DISMISS = "birzha_pwa_install_dismiss_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** Chromium: событие до показа системного диалога установки. */
type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<{ outcome: string }>;
};

export function PwaInstallBanner() {
  const { pathname } = useLocation();
  const sellerCabinet = isSellerCabinetPath(pathname);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isPwaStandalone() || !sellerCabinet) {
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
    if (isIosSafariNotStandalone()) {
      setShowIosHint(true);
    }
  }, [sellerCabinet]);

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

  if (dismissed || isPwaStandalone() || !sellerCabinet) {
    return null;
  }

  const showChromeInstall = Boolean(deferred);
  const showBanner = showChromeInstall || showIosHint;

  if (!showBanner) {
    return null;
  }

  return (
    <div className="birzha-pwa-install no-print" role="region" aria-label="Установка приложения">
      {showChromeInstall ? (
        <>
          <p className="birzha-pwa-install__text">
            <strong>Биржа</strong> — установите как приложение: ярлык на экран и быстрый запуск продаж.
          </p>
          <div className="birzha-pwa-install__actions">
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
          <p className="birzha-pwa-install__text">
            <strong>На iPhone/iPad:</strong> «Поделиться» (□↑) в Safari → «На экран «Домой»».
          </p>
          <button type="button" className="birzha-btn-ghost" onClick={dismiss}>
            Понятно
          </button>
        </>
      )}
    </div>
  );
}
