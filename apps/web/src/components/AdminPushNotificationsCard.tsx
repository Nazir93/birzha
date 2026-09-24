import { useCallback, useEffect, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { globalRoleCodes } from "../auth/global-roles.js";
import { pushNotificationsSupported, urlBase64ToUint8Array } from "../pwa/push-subscribe.js";

type PushStatus = "loading" | "unsupported" | "disabled_server" | "denied" | "off" | "on" | "error";

/**
 * Включение Web Push на устройстве админа: продажи с рейса (калибр, кг, цена, продавец, время).
 */
export function AdminPushNotificationsCard() {
  const { user, meta } = useAuth();
  const isAdmin = user != null && globalRoleCodes(user).has("admin");
  const serverEnabled = meta?.pushNotificationsApi === "enabled";

  const [status, setStatus] = useState<PushStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
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
  }, [isAdmin, serverEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="birzha-panel no-print" aria-label="Уведомления о продажах" style={{ marginTop: "0.75rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>Уведомления о продажах</h3>
      <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.65rem", lineHeight: 1.45 }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          {status !== "on" ? (
            <button type="button" className="birzha-btn" disabled={busy || status === "loading"} onClick={() => void enable()}>
              Включить уведомления
            </button>
          ) : (
            <button type="button" className="birzha-btn birzha-btn--secondary" disabled={busy} onClick={() => void disable()}>
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
        <p className="birzha-ui-sm" style={{ margin: "0.5rem 0 0" }} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
