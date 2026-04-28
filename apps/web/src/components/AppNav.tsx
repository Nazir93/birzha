import { NavLink, useLocation } from "react-router-dom";

import {
  cabinetIdFromPathname,
  cabinetForUser,
  hrefForPanelInCabinet,
  operationsPanelOrder,
  type CabinetId,
  type PanelId,
} from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";
import { accounting, adminRoutes, login, ops, prefix, sales } from "../routes.js";

const panelLabel: Record<PanelId, string> = {
  nakladnaya: "Накладная",
  distribution: "Распределение",
  reports: "Отчёты и рейсы",
  operations: "Операции",
  offline: "Офлайн-очередь",
  service: "Служебное (meta)",
  inventory: "Склады и калибры",
};

function navLinkClass(active: boolean): string {
  return `birzha-nav__link${active ? " birzha-nav__link--active" : ""}`;
}

export function AppNav() {
  const { meta, user, logout, ready } = useAuth();
  const { pathname } = useLocation();
  const cabinet = cabinetIdFromPathname(pathname) ?? (user ? cabinetForUser(user) : "operations");

  const showRestricted = ready && meta?.authApi === "enabled" && user !== null;

  const buildLinks: { to: string; label: string; key: string }[] = (() => {
    if (!user || !showRestricted) {
      return [
        { key: "nakl", to: ops.purchaseNakladnaya, label: "Накладная" },
        { key: "dist", to: ops.distribution, label: "Распределение" },
        { key: "rep", to: ops.reports, label: "Отчёты и рейсы" },
        { key: "op", to: ops.operations, label: "Операции" },
        { key: "off", to: ops.offline, label: "Офлайн-очередь" },
        { key: "svc", to: adminRoutes.service, label: "Служебное" },
      ];
    }

    const out: { to: string; label: string; key: string }[] = [];
    if (cabinet === "admin") {
      out.push({ to: adminRoutes.home, label: "Сводка", key: "admin-home" });
    }
    if (cabinet === "sales") {
      out.push({ to: sales.home, label: "Сводка", key: "sales-home" });
    }
    if (cabinet === "accounting") {
      out.push({ to: accounting.home, label: "Сводка", key: "acc-home" });
      out.push({ to: accounting.counterparties, label: "Контрагенты", key: "acc-cp" });
    }
    const panelOrder = operationsPanelOrder(user);
    for (const p of panelOrder) {
      const to = hrefForPanelInCabinet(user, p, cabinet);
      if (to) {
        out.push({ to, label: panelLabel[p], key: p });
      }
    }
    return out;
  })();

  const titleSuffix: Record<CabinetId, string> = {
    admin: "админ",
    operations: "закуп/склад/рейс",
    sales: "продавец",
    accounting: "бухгалтерия",
  };
  const prefixForCabinet = prefix[cabinet as keyof typeof prefix] ?? prefix.operations;

  return (
    <nav className="birzha-nav" aria-label="Разделы приложения">
      {buildLinks.map(({ to, label, key }) => (
        <NavLink
          key={`${key}-${to}`}
          to={to}
          className={({ isActive }) => navLinkClass(isActive)}
          end={to === prefix.admin || to === prefix.sales || to === prefix.accounting}
        >
          {label}
        </NavLink>
      ))}
      {ready && meta?.authApi === "enabled" && (
        <div className="birzha-nav__user">
          {user ? (
            <>
              <span className="birzha-nav__user-label" title={`${titleSuffix[cabinet]} · ${prefixForCabinet}`}>
                {user.login}
              </span>
              <button type="button" className="birzha-btn-ghost" onClick={() => void logout()}>
                Выйти
              </button>
            </>
          ) : (
            <NavLink to={login} end className={({ isActive }) => navLinkClass(isActive)}>
              Вход
            </NavLink>
          )}
        </div>
      )}
    </nav>
  );
}
