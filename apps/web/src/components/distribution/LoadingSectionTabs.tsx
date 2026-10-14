import { NavLink, useLocation } from "react-router-dom";

import { adminAwarePathForPath, adminRoutes, ops } from "../../routes.js";

function tabClassName({ isActive }: { isActive: boolean }): string {
  return `birzha-settings-tabs__tab${isActive ? " birzha-settings-tabs__tab--active" : ""}`;
}

/** Один раздел «Погрузка на машину»: новая ПН или догрузка в уже сохранённую. */
export function LoadingSectionTabs() {
  const { pathname } = useLocation();
  const distributionBase = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const appendBase = adminAwarePathForPath(pathname, adminRoutes.loadingAppend, ops.loadingAppend);
  return (
    <nav className="birzha-settings-tabs no-print" aria-label="Погрузка: новая или догрузка">
      <NavLink to={distributionBase} className={tabClassName}>
        Новая погрузочная
      </NavLink>
      <NavLink to={appendBase} className={tabClassName}>
        Догрузка в существующую
      </NavLink>
    </nav>
  );
}
