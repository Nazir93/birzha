import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canonicalPathForLegacy, type LegacySegment } from "../auth/role-panels.js";
import { adminRoutes, ops, routes } from "../routes.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";

const pathToLegacyKey = new Map<string, LegacySegment>([
  [routes.legacy.reports, "reports"],
  [routes.legacy.purchaseNakladnaya, "purchaseNakladnaya"],
  [routes.legacy.distribution, "distribution"],
  [routes.legacy.operations, "operations"],
  [routes.legacy.offline, "offline"],
  [routes.legacy.service, "service"],
]);

/** Старые URL без префикса кабинета → редирект в канонический путь. */
export function LegacyPathRedirect() {
  const { pathname } = useLocation();
  const { user, ready, meta } = useAuth();

  if (!ready) {
    return (
      <div style={{ maxWidth: 400, margin: "2rem 1rem" }} role="status" aria-live="polite">
        <LoadingBlock label="Загрузка…" minHeight={72} />
      </div>
    );
  }

  const key = pathToLegacyKey.get(pathname);
  if (!key) {
    return <Navigate to={ops.reports} replace />;
  }

  if (meta?.authApi !== "enabled" || !user) {
    const m: Record<LegacySegment, string> = {
      reports: ops.reports,
      purchaseNakladnaya: ops.purchaseNakladnaya,
      distribution: ops.distribution,
      operations: ops.operations,
      offline: ops.offline,
      service: adminRoutes.service,
    };
    return <Navigate to={m[key]} replace />;
  }
  return <Navigate to={canonicalPathForLegacy(key, user)} replace />;
}
