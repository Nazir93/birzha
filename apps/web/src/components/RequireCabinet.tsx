import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { canAccessCabinet, defaultRouteForUser, type CabinetId } from "../auth/role-panels.js";

/**
 * Кабинет по URL (`/a`, `/o`, `/s`, `/b`) — сужает доступ ролей, как на сервере по смыслу.
 */
export function RequireCabinet({ id, children }: { id: CabinetId; children: ReactNode }) {
  const { ready, meta, user } = useAuth();

  if (!ready) {
    return (
      <div role="status" aria-live="polite" style={{ margin: "0.75rem 0" }}>
        <LoadingBlock label="Загрузка…" minHeight={56} skeleton skeletonRows={3} />
      </div>
    );
  }

  const restricted = meta?.authApi === "enabled" && user !== null;
  if (restricted && user && !canAccessCabinet(user, id)) {
    return <Navigate to={defaultRouteForUser(user)} replace />;
  }

  return <>{children}</>;
}
