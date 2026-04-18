import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { routes } from "../routes.js";

/** Если `requireApiAuth` на сервере и сессии нет — редирект на `/login`. */
export function RequireApiAuthGate() {
  const { ready, meta, user, bootstrapError } = useAuth();
  const location = useLocation();

  if (bootstrapError) {
    return <Outlet />;
  }

  if (!ready) {
    return (
      <p role="status" aria-live="polite">
        Загрузка…
      </p>
    );
  }

  if (meta?.requireApiAuth === "enabled" && !user) {
    return <Navigate to={routes.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
