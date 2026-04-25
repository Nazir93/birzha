import { Link } from "react-router-dom";

import { adminRoutes, accounting, prefix } from "../routes.js";
import { useAuth } from "../auth/auth-context.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { sectionCard, muted, btnStyle } from "../ui/styles.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";

/**
 * Сводка бухкабинета: ссылка на отчёты; без форм ввода рейса/партий.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const showServiceLink = user && canManageInventoryCatalog(user);

  return (
    <section style={sectionCard} aria-labelledby="acc-home-h">
      <h2 id="acc-home-h" style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>
        Бухгалтерия
      </h2>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Сверка и контроль по рейсам: <strong>выручка, закуп, валовая, нал/долг</strong> — таблица ниже и в «Отчётах»
        по рейсу. Закуп и склад — в <code>{prefix.operations}</code>. Рейс создаётся логистом/руководителем.
      </p>
      <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.55 }}>
        <li>
          <Link to={accounting.reports} style={{ fontWeight: 600 }}>
            Отчёты по рейсам
          </Link>{" "}
          — детализация по рейсу (клиенты, партии, печать); для быстрого смотрите сводку ниже.
        </li>
        <li>
          <Link to={accounting.counterparties} style={{ fontWeight: 600 }}>
            Справочник контрагентов
          </Link>{" "}
          <span style={muted}>— список, добавление и снятие записи (роли: как на API для каталога).</span>
        </li>
        {showServiceLink ? (
          <li>
            <Link to={adminRoutes.service} style={{ fontWeight: 600 }}>
              Служебное (GET /api/meta)
            </Link>{" "}
            <span style={muted}>(admin/manager)</span>
          </li>
        ) : null}
      </ul>
      <AccountingTripsSummary />
      <p className="no-print" style={{ marginTop: "0.9rem" }}>
        <Link to={accounting.reports} style={btnStyle}>
          Подробный отчёт по рейсу
        </Link>
      </p>
    </section>
  );
}
