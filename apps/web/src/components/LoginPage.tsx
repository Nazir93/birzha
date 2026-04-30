import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { ops } from "../routes.js";
import { errorText, fieldStyle, muted } from "../ui/styles.js";

export function LoginPage() {
  const { ready, meta, user, login, bootstrapError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | undefined)?.from?.pathname ?? ops.reports;

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
          <p role="alert" style={errorText}>
            Сервер временно недоступен ({bootstrapError.message}). Попробуйте обновить страницу или обратитесь к администратору.
          </p>
        </section>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="birzha-login-wrap">
        <p role="status" aria-live="polite">
          Загрузка…
        </p>
      </div>
    );
  }

  if (meta?.requireApiAuth !== "enabled" || user) {
    return <Navigate to={from} replace />;
  }

  const submit = () => {
    setErr(null);
    setPending(true);
    void login(loginField.trim(), password)
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="birzha-login-wrap">
      <section className="birzha-login-card" aria-labelledby="login-heading">
        <h2 id="login-heading" className="birzha-page-title" style={{ marginTop: 0 }}>
          Вход
        </h2>
        <p style={{ ...muted, marginBottom: "0.65rem", lineHeight: 1.55 }}>
          У <strong>каждого пользователя свой логин и пароль</strong> — их выдаёт администратор (отдельная учётная запись на человека,
          без «общих» входов). Не передавайте свои данные другим.
        </p>
        <p style={{ ...muted, marginBottom: "1rem", fontSize: "0.88rem", lineHeight: 1.45 }}>
          Если забыли пароль или нужен новый доступ, обратитесь к администратору.
        </p>
        <label htmlFor="login-user" style={{ fontSize: "0.88rem" }}>
          Логин (ваш)
        </label>
        <input
          id="login-user"
          autoComplete="username"
          value={loginField}
          onChange={(e) => setLoginField(e.target.value)}
          style={{ ...fieldStyle, display: "block", width: "100%", marginBottom: "0.75rem" }}
        />
        <label htmlFor="login-pass" style={{ fontSize: "0.88rem" }}>
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
        {err && (
          <p role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
            {err}
          </p>
        )}
      </section>
    </div>
  );
}
