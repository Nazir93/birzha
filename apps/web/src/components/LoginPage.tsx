import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { postLoginRedirectPath } from "../auth/role-panels.js";
import { ops } from "../routes.js";
import { LoadingScreen } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { fieldStyle } from "../ui/styles.js";

function fromPathAfterLogin(state: unknown): string {
  if (!state || typeof state !== "object") {
    return "";
  }
  const from = (state as { from?: { pathname?: string; search?: string } }).from;
  if (!from || typeof from.pathname !== "string") {
    return "";
  }
  return `${from.pathname}${typeof from.search === "string" ? from.search : ""}`;
}

export function LoginPage() {
  const { ready, meta, user, login, bootstrapError } = useAuth();
  const location = useLocation();
  const from = fromPathAfterLogin(location.state);

  const [loginField, setLoginField] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (bootstrapError) {
    return (
      <div className="birzha-login-wrap">
        <section className="birzha-login-card" aria-labelledby="login-error-heading">
          <h2 id="login-error-heading" className="birzha-page-title" style={{ marginTop: 0 }}>
            Нет связи с API
          </h2>
          <ErrorAlert
            title="Нет связи с API"
            message="Сервер временно недоступен. Обновите страницу или обратитесь к администратору."
          />
        </section>
      </div>
    );
  }

  if (!ready) {
    return <LoadingScreen label="Загрузка…" />;
  }

  if (meta?.requireApiAuth !== "enabled") {
    return <Navigate to={from || ops.reports} replace />;
  }
  if (user) {
    return <Navigate to={postLoginRedirectPath(user, from)} replace />;
  }

  const submit = () => {
    setErr(null);
    setPending(true);
    void login(loginField.trim(), password)
      .catch((e: unknown) => {
        setErr(humanizeErrorMessage(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="birzha-login-wrap">
      <section className="birzha-login-card" aria-labelledby="login-heading">
        <h2 id="login-heading" className="birzha-page-title" style={{ marginTop: 0 }}>
          Вход
        </h2>
        <p className="birzha-callout-info" style={{ marginBottom: "0.65rem", lineHeight: 1.55 }}>
          Введите логин и пароль.
        </p>
        <label htmlFor="login-user" className="birzha-form-label">
          Логин (ваш)
        </label>
        <input
          id="login-user"
          autoComplete="username"
          value={loginField}
          onChange={(e) => setLoginField(e.target.value)}
          style={{ ...fieldStyle, display: "block", width: "100%", marginBottom: "0.75rem" }}
        />
        <label htmlFor="login-pass" className="birzha-form-label">
          Пароль (ваш)
        </label>
        <input
          id="login-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submit();
            }
          }}
          style={{ ...fieldStyle, display: "block", width: "100%", marginBottom: "1rem" }}
        />
        <button
          type="button"
          className="birzha-btn-primary"
          disabled={pending}
          aria-busy={pending ? true : undefined}
          onClick={submit}
        >
          {pending ? "Вход…" : "Войти"}
        </button>
        {err ? <ErrorAlert message={err} title="Не удалось войти" /> : null}
      </section>
    </div>
  );
}
