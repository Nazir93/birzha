import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet, isFieldSellerOnly } from "../auth/role-panels.js";
import { ops } from "../routes.js";
import { SellFromTripSection } from "./SellFromTripSection.js";

/**
 * Полевой продавец: только форма «Продажа с рейса» на `/s`, без переходов в другие разделы.
 * Совмещение ролей (seller + склад): ссылка в операции `/o`, без дубля отчёта на `/s/reports`.
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;
  const fieldSellerOnly = user ? isFieldSellerOnly(user) : false;

  return (
    <div className="birzha-seller-workspace birzha-home-premium" aria-labelledby="seller-cabinet-h">
      <header className="birzha-home-hero birzha-home-hero--sales">
        <div>
          <p className="birzha-home-hero__eyebrow">Продажи</p>
          <h2 id="seller-cabinet-h" className="birzha-home-hero__title">
            Кабинет продавца
          </h2>
        </div>
        {!fieldSellerOnly && canOpsCabinet ? (
          <nav className="birzha-home-actions no-print" aria-label="Связанные разделы">
            <Link to={ops.operations} className="birzha-home-action">
              <span>Для старшего</span>
              <strong>Операции склада</strong>
            </Link>
          </nav>
        ) : null}
      </header>

      <SellFromTripSection variant="seller" />
    </div>
  );
}
