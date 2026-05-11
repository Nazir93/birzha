import { Navigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { sales } from "../routes.js";
import { OperationsPanel } from "./OperationsPanel.js";
import { RequirePanel } from "./RequirePanel.js";

/**
 * У «чистого» продавца продажа только на `/s` — вкладка «Недостача по рейсу» ведёт на главную с тем же query (`trip`, …).
 * У продавца+склада показывается экран записи недостачи (`OperationsPanel`).
 */
export function SellerSalesOperationsRedirect() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  if (user && isFieldSellerOnly(user)) {
    const q = searchParams.toString();
    return <Navigate to={q ? `${sales.home}?${q}` : sales.home} replace />;
  }

  return (
    <RequirePanel panel="operations">
      <section className="birzha-card">
        <OperationsPanel />
      </section>
    </RequirePanel>
  );
}
