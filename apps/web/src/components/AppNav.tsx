import { NavLink, useLocation } from "react-router-dom";

import { buildCabinetNavEntries, cabinetNavLinkUsesEnd } from "../auth/cabinet-nav.js";
import { cabinetIdFromPathname, cabinetForUser, type CabinetId } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";

function navLinkClass(active: boolean, drawer?: boolean): string {
  const base = drawer ? "birzha-nav-drawer__link" : "birzha-nav__link";
  return `${base}${active ? ` ${drawer ? "birzha-nav-drawer__link--active" : "birzha-nav__link--active"}` : ""}`;
}

export type AppNavPanelProps = {
  /** Вызвать после перехода (закрыть мобильный drawer). */
  onNavigate?: () => void;
  /** Разметка для выезжающей панели — полноширинные пункты. */
  variant?: "bar" | "drawer";
};

/**
 * Ссылки и блок пользователя — общие для горизонтальной полосы и мобильного drawer.
 */
export function AppNavPanel({ onNavigate, variant = "bar" }: AppNavPanelProps) {
  const { meta, user, logout, ready } = useAuth();
  const { pathname } = useLocation();
  const cabinet: CabinetId = cabinetIdFromPathname(pathname) ?? (user ? cabinetForUser(user) : "operations");

  const showRestricted = ready && meta?.authApi === "enabled" && user !== null;
  const buildLinks = buildCabinetNavEntries(cabinet, user, showRestricted);

  const titleSuffix: Record<CabinetId, string> = {
    admin: "админ",
    operations: "закуп/склад/рейс",
    sales: "продавец",
    accounting: "бухгалтерия",
  };

  const afterNav = () => onNavigate?.();

  const drawer = variant === "drawer";

  return (
    <>
      {buildLinks.map(({ to, label, key }) => (
        <NavLink
          key={`${key}-${to}`}
          to={to}
          className={({ isActive }) => navLinkClass(isActive, drawer)}
          end={cabinetNavLinkUsesEnd(cabinet, to)}
          onClick={afterNav}
        >
          {label}
        </NavLink>
      ))}
      {ready && meta?.authApi === "enabled" && (
        <div className={drawer ? "birzha-nav-drawer__user" : "birzha-nav__user"}>
          {user ? (
            <>
              <span className="birzha-nav__user-label" title={titleSuffix[cabinet]}>
                Вы: {user.login}
              </span>
              <button
                type="button"
                className="birzha-btn-ghost"
                onClick={() => {
                  afterNav();
                  void logout();
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <NavLink to="/login" end className={({ isActive }) => navLinkClass(isActive, drawer)} onClick={afterNav}>
              Вход
            </NavLink>
          )}
        </div>
      )}
    </>
  );
}

export function AppNav() {
  return (
    <nav className="birzha-nav birzha-nav--desktop-only" aria-label="Разделы приложения">
      <AppNavPanel variant="bar" />
    </nav>
  );
}
