import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { buildCabinetNavEntries, cabinetNavLinkUsesEnd } from "../auth/cabinet-nav.js";
import type { CabinetId } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";

export type CabinetShellAccent = "admin" | "operations" | "sales" | "accounting";

function LogoutIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 7V5a2 2 0 012-2h7a2 2 0 012 2v14a2 2 0 01-2 2h-7a2 2 0 01-2-2v-2M3 12h12M3 12l4-4M3 12l4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={collapsed ? "M13 6l6 6-6 6" : "M11 6l-6 6 6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type SidebarNavIconName =
  | "dashboard"
  | "document"
  | "distribution"
  | "reports"
  | "operations"
  | "assignSeller"
  | "offline"
  | "inventory"
  | "users"
  | "service"
  | "counterparties";

function sidebarNavIconName(key: string): SidebarNavIconName {
  if (key === "home" || key.endsWith("-home")) {
    return "dashboard";
  }
  if (key === "nakl" || key === "nakladnaya") {
    return "document";
  }
  if (key === "lm" || key === "loadingManifests") {
    return "document";
  }
  if (key === "dist" || key === "distribution") {
    return "distribution";
  }
  if (key === "rep" || key === "reports") {
    return "reports";
  }
  if (key === "op" || key === "operations") {
    return "operations";
  }
  if (key === "assignSeller") {
    return "assignSeller";
  }
  if (key === "sellerDispatch") {
    return "assignSeller";
  }
  if (key === "off" || key === "offline") {
    return "offline";
  }
  if (key === "inventory") {
    return "inventory";
  }
  if (key === "users") {
    return "users";
  }
  if (key === "service") {
    return "service";
  }
  if (key === "acc-cp") {
    return "counterparties";
  }
  return "dashboard";
}

function SidebarNavIcon({ name }: { name: SidebarNavIconName }) {
  const paths: Record<SidebarNavIconName, string[]> = {
    dashboard: ["M4 13h7V4H4v9z", "M13 20h7V4h-7v16z", "M4 20h7v-5H4v5z"],
    document: ["M7 3h7l4 4v14H7V3z", "M14 3v5h5", "M9.5 12h6", "M9.5 16h6"],
    distribution: ["M4 7h5v5H4V7z", "M15 4h5v5h-5V4z", "M15 15h5v5h-5v-5z", "M9 9.5h3.5a3 3 0 013 3V15", "M12.5 12.5H15"],
    reports: ["M5 19V5", "M5 19h14", "M9 15v-4", "M13 15V8", "M17 15v-7"],
    operations: ["M7 7h10", "M14 4l3 3-3 3", "M17 17H7", "M10 14l-3 3 3 3"],
    assignSeller: ["M7 7h10", "M12 12h8", "M9 18a3 3 0 100-6 3 3 0 000 6z", "M4 20a5 5 0 0110 0"],
    offline: ["M6.5 18h10a4 4 0 00.8-7.9A6 6 0 005.6 8.3A4.5 4.5 0 006.5 18z", "M8 8l8 8"],
    inventory: ["M4 9l8-4 8 4-8 4-8-4z", "M6 11v6l6 3 6-3v-6", "M12 13v7"],
    users: ["M9 11a3 3 0 100-6 3 3 0 000 6z", "M4 20a5 5 0 0110 0", "M17 11a2.5 2.5 0 100-5", "M15.5 15.5A4 4 0 0120 20"],
    service: ["M14.5 5.5a4 4 0 00-5.1 5.1L4 16v4h4l5.4-5.4a4 4 0 005.1-5.1l-3 3-4-4 3-3z"],
    counterparties: ["M4 20h16", "M6 20V8l6-4 6 4v12", "M9 20v-5h6v5", "M9 10h.01", "M12 10h.01", "M15 10h.01"],
  };

  return (
    <svg className="birzha-cabinet-sidebar__icon" width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      {paths[name].map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

type CabinetShellLayoutProps = {
  cabinetId: CabinetId;
  title: string;
  accent: CabinetShellAccent;
};

/**
 * Общий каркас кабинета: шапка, сворачиваемый сайдбар, контент (`Outlet`).
 */
export function CabinetShellLayout({ cabinetId, title, accent }: CabinetShellLayoutProps) {
  const { user, meta, logout, ready } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const authRestricted = Boolean(ready && meta?.authApi === "enabled" && user !== null);
  const entries = useMemo(
    () => buildCabinetNavEntries(cabinetId, user, authRestricted),
    [cabinetId, user, authRestricted],
  );

  const showUser = ready && meta?.authApi === "enabled";

  return (
    <div className={`birzha-cabinet-layout birzha-cabinet-layout--${accent}`}>
      <header className="birzha-cabinet-topbar no-print">
        <div className="birzha-cabinet-topbar__brand">
          <span className="birzha-cabinet-topbar__title">{title}</span>
        </div>
        {showUser ? (
          <div className="birzha-cabinet-topbar__actions">
            {user ? (
              <>
                <span className="birzha-cabinet-topbar__user" title={user.login}>
                  {user.login}
                </span>
                <button
                  type="button"
                  className="birzha-cabinet-topbar__logout"
                  onClick={() => void logout()}
                  aria-label="Выйти из системы"
                  title="Выйти"
                >
                  <LogoutIcon />
                </button>
              </>
            ) : (
              <NavLink to="/login" className="birzha-cabinet-topbar__login-link">
                Вход
              </NavLink>
            )}
          </div>
        ) : null}
      </header>

      <div className="birzha-cabinet-body">
        <aside
          className={`birzha-cabinet-sidebar no-print${sidebarCollapsed ? " birzha-cabinet-sidebar--collapsed" : ""}`}
          aria-label="Разделы приложения"
        >
          <button
            type="button"
            className="birzha-cabinet-sidebar__toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-expanded={!sidebarCollapsed}
            aria-controls="birzha-cabinet-sidebar-nav"
            title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
          </button>
          <nav id="birzha-cabinet-sidebar-nav" className="birzha-cabinet-sidebar__nav" aria-label="Разделы приложения">
            {entries.map(({ to, label, key }) => (
              <NavLink
                key={`${key}-${to}`}
                to={to}
                end={cabinetNavLinkUsesEnd(cabinetId, to)}
                className={({ isActive }) =>
                  `birzha-cabinet-sidebar__link${isActive ? " birzha-cabinet-sidebar__link--active" : ""}`
                }
                title={sidebarCollapsed ? label : undefined}
                aria-label={label}
              >
                <SidebarNavIcon name={sidebarNavIconName(key)} />
                <span className="birzha-cabinet-sidebar__link-text">{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="birzha-cabinet-main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminCabinetLayout() {
  return (
    <CabinetShellLayout
      cabinetId="admin"
      title="Панель администратора"
      accent="admin"
    />
  );
}

export function OperationsCabinetLayout() {
  return (
    <CabinetShellLayout
      cabinetId="operations"
      title="Кабинет закупки и склада"
      accent="operations"
    />
  );
}

export function SalesCabinetLayout() {
  return <CabinetShellLayout cabinetId="sales" title="Кабинет продаж" accent="sales" />;
}

export function AccountingCabinetLayout() {
  return (
    <CabinetShellLayout cabinetId="accounting" title="Кабинет бухгалтерии" accent="accounting" />
  );
}
