import { useCallback, useEffect, useRef, useState } from "react";

import { btnStyleInline } from "../ui/styles.js";
import {
  BIRZHA_MUTATION_ERROR_EVENT,
  type BirzhaMutationErrorDetail,
} from "./mutation-error-bus.js";

const AUTO_DISMISS_MS = 12_000;
const DEDUPE_MS = 2_000;

/**
 * Показывает краткое сообщение при ошибке любой `useMutation` (через шину в `createWebQueryClient`).
 * Дубли одного и того же текста за 2 с подавляются.
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
      const text = ce.detail?.message?.trim() ?? "";
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
    <div
      role="alert"
      aria-live="assertive"
      className="no-print"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        transform: "translateX(-50%)",
        zIndex: 9999,
        maxWidth: "min(42rem, calc(100vw - 2rem))",
        padding: "0.65rem 1rem",
        borderRadius: "var(--birzha-radius)",
        border: "1px solid var(--color-border)",
        background: "var(--birzha-surface)",
        boxShadow: "var(--birzha-shadow-sm)",
        fontFamily: "var(--font-ui, system-ui, sans-serif)",
        fontSize: "0.9rem",
        lineHeight: 1.45,
        color: "var(--color-text)",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.65rem",
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0, wordBreak: "break-word" }}>
        <strong style={{ display: "block", marginBottom: "0.2rem", color: "var(--birzha-danger, #b91c1c)" }}>
          Ошибка запроса
        </strong>
        {message}
      </span>
      <button type="button" style={{ ...btnStyleInline, flex: "0 0 auto", marginTop: 2 }} onClick={dismiss}>
        Закрыть
      </button>
    </div>
  );
}
