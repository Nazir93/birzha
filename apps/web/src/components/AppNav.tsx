import { NavLink } from "react-router-dom";
import type { CSSProperties } from "react";

import { canAccessPanel, type PanelId } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";
import { routes } from "../routes.js";
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

const items: { to: string; label: string; panel: PanelId }[] = [
  { to: routes.reports, label: "Отчёты и рейсы", panel: "reports" },
  { to: routes.purchaseNakladnaya, label: "Накладная", panel: "nakladnaya" },
  { to: routes.operations, label: "Операции", panel: "operations" },
  { to: routes.offline, label: "Офлайн-очередь", panel: "offline" },
  { to: routes.service, label: "Служебное", panel: "service" },
];

export function AppNav() {
  const { meta, user, logout, ready } = useAuth();

  const navItems = items.filter((item) => {
    if (!ready || meta?.authApi !== "enabled" || !user) {
      return true;
    }
    return canAccessPanel(user, item.panel);
  });

  return (
    <nav style={navStyle} aria-label="Разделы приложения">
      {navItems.map(({ to, label }) => (
        <NavLink key={to} to={to} style={({ isActive }) => ({ ...tab(isActive), textDecoration: "none" })}>
          {label}
        </NavLink>
      ))}
      {ready && meta?.authApi === "enabled" && (
        <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          {user ? (
            <>
              <span style={{ ...muted, fontSize: "0.88rem" }}>{user.login}</span>
              <button type="button" style={btnStyleInline} onClick={() => void logout()}>
                Выйти
              </button>
            </>
          ) : (
            <NavLink to={routes.login} style={({ isActive }) => ({ ...tab(isActive), textDecoration: "none" })}>
              Вход
            </NavLink>
          )}
        </span>
      )}
    </nav>
  );
}
