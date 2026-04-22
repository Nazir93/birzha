import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { routes } from "../routes.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";

/** Если `requireApiAuth` на сервере и сессии нет — редирект на `/login`. */
export function RequireApiAuthGate() {
  const { ready, meta, user, bootstrapError } = useAuth();
  const location = useLocation();

  if (bootstrapError) {
    return <Outlet />;
  }

  if (!ready) {
    return (
      <div style={{ maxWidth: 400, margin: "2rem 1rem" }} role="status" aria-live="polite">
        <LoadingBlock label="Загрузка сессии и настроек API (GET /api/meta)…" minHeight={80} />
      </div>
    );
  }

  if (meta?.requireApiAuth === "enabled" && !user) {
    return <Navigate to={routes.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
