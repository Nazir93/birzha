import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet, isFieldSellerOnly } from "../auth/role-panels.js";
import { ops, sales } from "../routes.js";
import { SellFromTripSection } from "./SellFromTripSection.js";

/**
 * Полевой продавец: форма «Продажа с рейса» и ссылка на отчёт по закреплённым рейсам.
 * Совмещение ролей (seller + склад): ссылка в операции `/o`.
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
        <nav className="birzha-home-actions no-print" aria-label="Разделы кабинета продавца">
          {fieldSellerOnly ? (
            <Link to={sales.reports} className="birzha-home-action">
              <span>Итоги</span>
              <strong>Отчёт по рейсу</strong>
            </Link>
          ) : null}
          {!fieldSellerOnly && canOpsCabinet ? (
            <Link to={ops.operations} className="birzha-home-action">
              <span>Для старшего</span>
              <strong>Операции склада</strong>
            </Link>
          ) : null}
        </nav>
      </header>

      <SellFromTripSection />
    </div>
  );
}
