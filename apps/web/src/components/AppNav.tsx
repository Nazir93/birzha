import { NavLink, useLocation } from "react-router-dom";
import type { CSSProperties } from "react";

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
import { btnStyleInline, muted } from "../ui/styles.js";

const navStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  marginBottom: "1rem",
  paddingBottom: "0.75rem",
  borderBottom: "1px solid #e4e4e7",
};

const tab = (active: boolean): CSSProperties => ({
  padding: "0.5rem 0.9rem",
  fontSize: "0.92rem",
  cursor: "pointer",
  borderRadius: 6,
  border: active ? "1px solid #15803d" : "1px solid #d4d4d8",
  background: active ? "#ecfdf5" : "#fff",
  color: active ? "#14532d" : "#3f3f46",
  fontWeight: active ? 600 : 400,
});

const panelLabel: Record<PanelId, string> = {
  nakladnaya: "Накладная",
  distribution: "Распределение",
  reports: "Отчёты и рейсы",
  operations: "Операции",
  offline: "Офлайн-очередь",
  service: "Служебное (meta)",
  inventory: "Склады и калибры",
};

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
    <nav style={navStyle} aria-label="Разделы приложения">
      {buildLinks.map(({ to, label, key }) => (
        <NavLink
          key={`${key}-${to}`}
          to={to}
          style={({ isActive }) => ({ ...tab(isActive), textDecoration: "none" })}
        >
          {label}
        </NavLink>
      ))}
      {ready && meta?.authApi === "enabled" && (
        <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          {user ? (
            <>
              <span style={{ ...muted, fontSize: "0.88rem" }} title={`${titleSuffix[cabinet]} · ${prefixForCabinet}`}>
                {user.login}
              </span>
              <button type="button" style={btnStyleInline} onClick={() => void logout()}>
                Выйти
              </button>
            </>
          ) : (
            <NavLink to={login} style={({ isActive }) => ({ ...tab(isActive), textDecoration: "none" })}>
              Вход
            </NavLink>
          )}
        </span>
      )}
    </nav>
  );
}
