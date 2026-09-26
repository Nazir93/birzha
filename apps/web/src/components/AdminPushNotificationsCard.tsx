import { useCallback, useEffect, useId, useRef, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { globalRoleCodes } from "../auth/global-roles.js";
import { pushNotificationsSupported, urlBase64ToUint8Array } from "../pwa/push-subscribe.js";

type PushStatus = "loading" | "unsupported" | "disabled_server" | "denied" | "off" | "on" | "error";

function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a5 5 0 00-5 5v2.2c0 .7-.2 1.4-.6 2L5.2 14.5A1 1 0 006 16h12a1 1 0 00.8-1.5L17.6 12.2c-.4-.6-.6-1.3-.6-2V8a5 5 0 00-5-5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 17a2 2 0 004 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Значок в шапке: Web Push о продажах с рейса (admin / manager).
 */
export function AdminPushNotificationsCard() {
  const { user, meta } = useAuth();
  const isLeadership = user != null && (globalRoleCodes(user).has("admin") || globalRoleCodes(user).has("manager"));
  const serverEnabled = meta?.pushNotificationsApi === "enabled";
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PushStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLeadership) {
      setStatus("unsupported");
      return;
    }
    if (!pushNotificationsSupported()) {
      setStatus("unsupported");
      return;
    }
    if (!serverEnabled) {
      setStatus("disabled_server");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
      setMessage(null);
    } catch {
      setStatus("error");
      setMessage("Не удалось проверить подписку.");
    }
  }, [isLeadership, serverEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        setMessage("Разрешите уведомления в настройках браузера.");
        return;
      }
      const keyRes = await apiFetch("/api/push/vapid-public-key");
      await assertOkResponse(keyRes);
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        throw new Error("Подписка без ключей");
      }
      const save = await apiFetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
      });
      await assertOkResponse(save);
      setStatus("on");
      setMessage("Уведомления включены на этом устройстве.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось включить уведомления.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await apiFetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMessage("Уведомления выключены на этом устройстве.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось выключить.");
    } finally {
      setBusy(false);
    }
  };

  if (!isLeadership) {
    return null;
  }

  const needsAttention = status === "off" || status === "denied" || status === "error";
  const title =
    status === "on"
      ? "Уведомления о продажах включены"
      : status === "off"
        ? "Уведомления о продажах выключены"
        : "Уведомления о продажах";

  return (
    <div className="birzha-push-bell no-print" ref={rootRef}>
      <button
        type="button"
        className={`birzha-push-bell__btn${needsAttention ? " birzha-push-bell__btn--attention" : ""}${open ? " birzha-push-bell__btn--open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={title}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {needsAttention ? <span className="birzha-push-bell__dot" aria-hidden /> : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="birzha-push-bell__panel"
          role="dialog"
          aria-label="Уведомления о продажах"
        >
          <h3 className="birzha-push-bell__title">Уведомления о продажах</h3>
          <p className="birzha-ui-sm birzha-text-muted birzha-push-bell__note">
            Push на это устройство: калибр, кг, цена, продавец и время по каждой продаже с рейса.
          </p>
          {status === "unsupported" ? (
            <p className="birzha-ui-sm" role="status">
              Браузер не поддерживает push. Добавьте сайт на главный экран (PWA) и откройте из ярлыка.
            </p>
          ) : null}
          {status === "disabled_server" ? (
            <p className="birzha-ui-sm" role="status">
              На сервере ещё не настроены ключи push (VAPID).
            </p>
          ) : null}
          {status === "denied" ? (
            <p className="birzha-ui-sm" role="status">
              Уведомления запрещены в настройках браузера / системы.
            </p>
          ) : null}
          {status === "off" || status === "on" || status === "error" || status === "loading" ? (
            <div className="birzha-push-bell__actions">
              {status !== "on" ? (
                <button
                  type="button"
                  className="birzha-btn"
                  disabled={busy || status === "loading"}
                  onClick={() => void enable()}
                >
                  Включить уведомления
                </button>
              ) : (
                <button
                  type="button"
                  className="birzha-btn birzha-btn--secondary"
                  disabled={busy}
                  onClick={() => void disable()}
                >
                  Выключить на этом устройстве
                </button>
              )}
              {status === "on" ? (
                <span className="birzha-ui-sm" style={{ fontWeight: 600 }}>
                  Включены
                </span>
              ) : null}
            </div>
          ) : null}
          {message ? (
            <p className="birzha-ui-sm birzha-push-bell__msg" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
