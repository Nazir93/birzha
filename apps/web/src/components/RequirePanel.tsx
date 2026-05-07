import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { canAccessPanel, defaultRouteForUser, type PanelId } from "../auth/role-panels.js";

/**
 * При включённом `authApi` и залогиненном пользователе — только разрешённые панели;
 * иначе (нет входа на сервере или аноним) — без ограничений.
 */
export function RequirePanel({ panel, children }: { panel: PanelId; children: ReactNode }) {
  const { ready, meta, user } = useAuth();

  if (!ready) {
    return (
      <div role="status" aria-live="polite" style={{ margin: "0.75rem 0" }}>
        <LoadingBlock label="Загрузка…" minHeight={56} skeleton skeletonRows={3} />
      </div>
    );
  }

  const restricted = meta?.authApi === "enabled" && user !== null;
  if (restricted && user && !canAccessPanel(user, panel)) {
    return <Navigate to={defaultRouteForUser(user)} replace />;
  }

  return <>{children}</>;
}
