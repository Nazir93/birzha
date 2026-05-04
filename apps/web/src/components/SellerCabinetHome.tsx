import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { ops, sales } from "../routes.js";
import { SellFromTripSection } from "./SellFromTripSection.js";
import { SellerSalesSummary } from "./SellerSalesSummary.js";

/**
 * Полевой продавец: один экран — продажа с рейса (без дублирования с «Операциями»).
 * PWA: см. `birzha-seller-workspace` в CSS (safe-area, крупная кнопка в форме).
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;

  return (
    <div className="birzha-seller-workspace birzha-home-premium" aria-labelledby="seller-work-h">
      <header className="birzha-home-hero birzha-home-hero--sales">
        <div>
          <p className="birzha-home-hero__eyebrow">Продажи</p>
          <h2 id="seller-work-h" className="birzha-home-hero__title">
            Быстрая продажа с рейса
          </h2>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия продавца">
          <Link to={sales.reports} className="birzha-home-action">
            <span>Отчёт по рейсу</span>
            <strong>Контроль продаж</strong>
          </Link>
          <Link to={sales.offline} className="birzha-home-action">
            <span>Офлайн</span>
            <strong>Очередь отправки</strong>
          </Link>
          {canOpsCabinet && (
            <Link to={ops.operations} className="birzha-home-action">
              <span>Склад</span>
              <strong>Все операции</strong>
            </Link>
          )}
        </nav>
      </header>

      <SellerSalesSummary />

      <section className="birzha-home-work-card" aria-label="Форма продажи">
        <SellFromTripSection variant="seller" />
      </section>
    </div>
  );
}
