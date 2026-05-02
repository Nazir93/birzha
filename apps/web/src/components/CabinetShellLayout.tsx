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
          <nav id="birzha-cabinet-sidebar-nav" className="birzha-cabinet-sidebar__nav">
            {entries.map(({ to, label, key }) => (
              <NavLink
                key={`${key}-${to}`}
                to={to}
                end={cabinetNavLinkUsesEnd(cabinetId, to)}
                className={({ isActive }) =>
                  `birzha-cabinet-sidebar__link${isActive ? " birzha-cabinet-sidebar__link--active" : ""}`
                }
                title={sidebarCollapsed ? label : undefined}
              >
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
