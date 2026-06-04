import { NavLink, Outlet } from "react-router-dom";

import { adminRoutes } from "../routes.js";

function tabClassName({ isActive }: { isActive: boolean }): string {
  return `birzha-settings-tabs__tab${isActive ? " birzha-settings-tabs__tab--active" : ""}`;
}

/** Оболочка «Настройки»: вкладки справочников и сотрудников. */
export function SettingsAdminLayout() {
  return (
    <section className="birzha-home-premium birzha-settings-admin" aria-labelledby="settings-admin-heading">
      <header className="birzha-home-hero birzha-settings-admin__hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Администрирование</p>
          <h2 id="settings-admin-heading" className="birzha-home-hero__title">
            Настройки
          </h2>
        </div>
      </header>

      <nav className="birzha-settings-tabs no-print" aria-label="Разделы настроек">
        <NavLink to={adminRoutes.settingsCatalog} className={tabClassName} end>
          Справочники
        </NavLink>
        <NavLink to={adminRoutes.settingsDocuments} className={tabClassName}>
          Накладные
        </NavLink>
        <NavLink to={adminRoutes.settingsTeam} className={tabClassName}>
          Сотрудники
        </NavLink>
      </nav>

      <div className="birzha-settings-admin__panel">
        <Outlet />
      </div>
    </section>
  );
}
