import { Navigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { sales } from "../routes.js";
import { TripReportPanel } from "./TripReportPanel.js";
import { RequirePanel } from "./RequirePanel.js";

/**
 * Полевой продавец (только seller) не открывает отчёт по рейсу в `/s` — только форма на `/s`.
 * Совмещение ролей (seller + склад и т.п.), зашедшее на `/s/reports`, видит панель как раньше.
 */
export function FieldSellerSalesReportsRedirect() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  if (user && isFieldSellerOnly(user)) {
    const q = searchParams.toString();
    return <Navigate to={q ? `${sales.home}?${q}` : sales.home} replace />;
  }

  return (
    <RequirePanel panel="reports">
      <section className="birzha-card">
        <TripReportPanel viewContext="sales" />
      </section>
    </RequirePanel>
  );
}
