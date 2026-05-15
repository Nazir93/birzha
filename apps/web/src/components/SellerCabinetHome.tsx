import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { ops, sales } from "../routes.js";
import { SellFromTripSection } from "./SellFromTripSection.js";
import { SellerCabinetOverview } from "./SellerCabinetOverview.js";

/**
 * Полевой продавец: сводка по выбранному рейсу и форма продажи с рейса.
 * PWA: см. `birzha-seller-workspace` в CSS (safe-area, крупная кнопка в форме).
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;

  return (
    <div className="birzha-seller-workspace birzha-home-premium" aria-labelledby="seller-cabinet-h">
      <header className="birzha-home-hero birzha-home-hero--sales">
        <div>
          <p className="birzha-home-hero__eyebrow">Продажи</p>
          <h2 id="seller-cabinet-h" className="birzha-home-hero__title">
            Кабинет продавца
          </h2>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Разделы кабинета продавца">
          <Link to={sales.reports} className="birzha-home-action">
            <span>Отчёты</span>
            <strong>По рейсу (партии, клиенты)</strong>
          </Link>
          {canOpsCabinet && (
            <Link to={ops.operations} className="birzha-home-action">
              <span>Для старшего</span>
              <strong>Операции склада</strong>
            </Link>
          )}
        </nav>
      </header>

      <SellerCabinetOverview />

      <SellFromTripSection variant="seller" />
    </div>
  );
}
