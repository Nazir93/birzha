import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { accounting, adminRoutes } from "../routes.js";
import { AccountingDashboardSummary } from "./AccountingDashboardSummary.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";

/**
 * Главная бухкабинета: остатки, выручка и прибыль по данным API; без форм ввода рейса/партий.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const canGoToAdminPanel = user ? canAccessCabinet(user, "admin") : false;

  return (
    <section className="birzha-home-premium birzha-section-shell" aria-labelledby="acc-home-h">
      <header className="birzha-home-hero birzha-home-hero--accounting birzha-section-hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h2 id="acc-home-h" className="birzha-home-hero__title">
            Деньги, остатки и рейсы
          </h2>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия бухгалтерии">
          <a href="#acc-stock" className="birzha-home-action">
            <span>Остатки</span>
            <strong>Сводка товара</strong>
          </a>
          <a href="#acc-trips" className="birzha-home-action">
            <span>Деньги</span>
            <strong>По рейсам</strong>
          </a>
          <Link to={accounting.reports} className="birzha-home-action">
            <span>Отчёт</span>
            <strong>Детали рейса</strong>
          </Link>
          <Link to={accounting.counterparties} className="birzha-home-action">
            <span>Клиенты</span>
            <strong>Контрагенты</strong>
          </Link>
          {canGoToAdminPanel ? (
            <Link to={adminRoutes.home} className="birzha-home-action">
              <span>Переход</span>
              <strong>В админ-панель</strong>
            </Link>
          ) : null}
        </nav>
      </header>

      <AccountingDashboardSummary />

      <AccountingTripsSummary />
    </section>
  );
}
