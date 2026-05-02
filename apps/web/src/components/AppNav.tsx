import { NavLink, useLocation } from "react-router-dom";

import { buildCabinetNavEntries, cabinetNavLinkUsesEnd } from "../auth/cabinet-nav.js";
import { cabinetIdFromPathname, cabinetForUser, type CabinetId } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";

function navLinkClass(active: boolean): string {
  return `birzha-nav__link${active ? " birzha-nav__link--active" : ""}`;
}

export function AppNav() {
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

  return (
    <nav className="birzha-nav" aria-label="Разделы приложения">
      {buildLinks.map(({ to, label, key }) => (
        <NavLink
          key={`${key}-${to}`}
          to={to}
          className={({ isActive }) => navLinkClass(isActive)}
          end={cabinetNavLinkUsesEnd(cabinet, to)}
        >
          {label}
        </NavLink>
      ))}
      {ready && meta?.authApi === "enabled" && (
        <div className="birzha-nav__user">
          {user ? (
            <>
              <span className="birzha-nav__user-label" title={titleSuffix[cabinet]}>
                Вы: {user.login}
              </span>
              <button type="button" className="birzha-btn-ghost" onClick={() => void logout()}>
                Выйти
              </button>
            </>
          ) : (
            <NavLink to="/login" end className={({ isActive }) => navLinkClass(isActive)}>
              Вход
            </NavLink>
          )}
        </div>
      )}
    </nav>
  );
}
