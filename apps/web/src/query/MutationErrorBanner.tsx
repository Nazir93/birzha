import { useCallback, useEffect, useRef, useState } from "react";

import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { BirzhaAlert } from "../ui/BirzhaAlert.js";
import {
  BIRZHA_MUTATION_ERROR_EVENT,
  type BirzhaMutationErrorDetail,
} from "./mutation-error-bus.js";

const AUTO_DISMISS_MS = 14_000;
const DEDUPE_MS = 2_000;

/**
 * Показывает краткое сообщение при ошибке любой `useMutation` (через шину в `createWebQueryClient`).
 */
export function MutationErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShown = useRef<{ text: string; at: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current != null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  useEffect(() => {
    const onEvent = (ev: Event) => {
      const ce = ev as CustomEvent<BirzhaMutationErrorDetail>;
      const text = humanizeErrorMessage(new Error(ce.detail?.message?.trim() ?? ""));
      if (text === "") {
        return;
      }
      const now = Date.now();
      const prev = lastShown.current;
      if (prev && prev.text === text && now - prev.at < DEDUPE_MS) {
        return;
      }
      lastShown.current = { text, at: now };
      setMessage(text);
      clearTimer();
      dismissTimer.current = setTimeout(() => {
        dismissTimer.current = null;
        setMessage(null);
      }, AUTO_DISMISS_MS);
    };
    window.addEventListener(BIRZHA_MUTATION_ERROR_EVENT, onEvent);
    return () => {
      window.removeEventListener(BIRZHA_MUTATION_ERROR_EVENT, onEvent);
      clearTimer();
    };
  }, [clearTimer]);

  if (!message) {
    return null;
  }

  return (
    <div className="birzha-alert-toast-host no-print">
      <BirzhaAlert
        variant="error"
        title="Не удалось сохранить"
        className="birzha-alert--toast"
        onDismiss={dismiss}
        live="assertive"
      >
        {message}
      </BirzhaAlert>
    </div>
  );
}
