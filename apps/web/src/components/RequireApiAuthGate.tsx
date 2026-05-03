import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { login } from "../routes.js";
import { LoadingScreen } from "../ui/LoadingIndicator.js";
import { errorText } from "../ui/styles.js";

/** Если `requireApiAuth` на сервере и сессии нет — редирект на `/login`. */
export function RequireApiAuthGate() {
  const { ready, meta, user, bootstrapError } = useAuth();
  const location = useLocation();

  if (bootstrapError) {
    return (
      <section className="birzha-card" role="alert" aria-labelledby="auth-bootstrap-error-heading">
        <h2 id="auth-bootstrap-error-heading" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
          Не удалось проверить вход
        </h2>
        <p style={errorText}>
          Сервер или сессия временно недоступны ({bootstrapError.message}). Обновите страницу или обратитесь к администратору.
        </p>
      </section>
    );
  }

  if (!ready) {
    return <LoadingScreen label="Проверяем вход и настройки…" />;
  }

  if (meta?.requireApiAuth === "enabled" && !user) {
    return <Navigate to={login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
