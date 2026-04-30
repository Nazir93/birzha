import { Link } from "react-router-dom";

import { adminRoutes, accounting } from "../routes.js";
import { useAuth } from "../auth/auth-context.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { muted, btnStyle } from "../ui/styles.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";

/**
 * Главная бухкабинета: остатки, выручка и прибыль по данным API; без форм ввода рейса/партий.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const showServiceLink = user && canManageInventoryCatalog(user);

  return (
    <section className="birzha-card" aria-labelledby="acc-home-h">
      <h2 id="acc-home-h" className="birzha-section-title">
        Бухгалтерия — сводка
      </h2>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.55 }}>
        На этой странице автоматически собираются <strong>остатки товара</strong> (склад и «в пути») с оценкой по цене
        закупа партии и <strong>финансовые итоги по рейсам</strong>: выручка, себестоимость продаж и недостач, валовая
        прибыль, наличные и долг. Ввод закупок и движений — в кабинете операций; детальная сверка по рейсу и
        печать — в отчётах.
      </p>
      <ul style={{ margin: "0 0 1rem", paddingLeft: "1.15rem", lineHeight: 1.55 }}>
        <li>
          <a href="#acc-stock" style={{ fontWeight: 600 }}>
            Остатки и оценка закупом
          </a>{" "}
          <span style={muted}>— блок ниже.</span>
        </li>
        <li>
          <a href="#acc-trips" style={{ fontWeight: 600 }}>
            Деньги по рейсам
          </a>{" "}
          <span style={muted}>— диаграмма выручки и таблица с итоговой строкой.</span>
        </li>
        <li>
          <Link to={accounting.reports} style={{ fontWeight: 600 }}>
            Отчёты по рейсам
          </Link>{" "}
          — клиенты, партии, недостачи, печать.
        </li>
        <li>
          <Link to={accounting.counterparties} style={{ fontWeight: 600 }}>
            Справочник контрагентов
          </Link>{" "}
          <span style={muted}>— клиенты продаж с рейса.</span>
        </li>
        {showServiceLink ? (
          <li>
            <Link to={adminRoutes.service} style={{ fontWeight: 600 }}>
              Диагностика сервера
            </Link>{" "}
            <span style={muted}>(admin/manager)</span>
          </li>
        ) : null}
      </ul>

      <AccountingStockBalances />

      <AccountingTripsSummary />

      <p className="no-print" style={{ marginTop: "1rem" }}>
        <Link to={accounting.reports} style={btnStyle}>
          Открыть отчёт по рейсу
        </Link>
      </p>
    </section>
  );
}
