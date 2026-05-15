import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useMatchMedia } from "../hooks/useMatchMedia.js";
import { AppNav, AppNavPanel } from "./AppNav.js";
import { ThemeToggle } from "./ThemeToggle.js";

const mqMobile = "(max-width: 47.9375rem)"; /* < 768px */

function MenuIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Верхняя полоса для маршрутов без кабинетского каркаса: липкая шапка + на мобильном drawer. */
export function LegacyChrome({ title = "Биржа" }: { title?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useMatchMedia(mqMobile);
  const mobile = isMobile === true;
  const { pathname } = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="birzha-app-header birzha-app-header--sticky no-print">
        <div className="birzha-app-header__top">
          {mobile ? (
            <button
              type="button"
              className="birzha-app-header__menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls="birzha-legacy-drawer"
              aria-label="Открыть меню разделов"
            >
              <MenuIcon />
            </button>
          ) : null}
          <h1 className="birzha-page-title birzha-app-header__title">{title}</h1>
          <div className="birzha-app-header__actions">
            <ThemeToggle />
          </div>
        </div>
        {import.meta.env.DEV ? (
          <p className="birzha-callout-info birzha-app-header__dev-hint" style={{ marginBottom: "0.65rem", fontSize: "0.82rem" }}>
            Клиент: Vite + React + TanStack Query + React Router. API: <code>pnpm dev:api</code> на порту 3000, в dev —
            прокси <code> /api/…</code>.
          </p>
        ) : null}
        {!mobile ? <AppNav /> : null}
      </header>

      {mobile && drawerOpen ? (
        <>
          <div
            className="birzha-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            id="birzha-legacy-drawer"
            className="birzha-legacy-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Меню разделов"
          >
            <div className="birzha-legacy-drawer__head">
              <span className="birzha-legacy-drawer__title">Разделы</span>
              <button
                type="button"
                className="birzha-legacy-drawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Закрыть меню"
              >
                <CloseIcon />
              </button>
            </div>
            <nav className="birzha-legacy-drawer__nav" aria-label="Разделы приложения">
              <AppNavPanel variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <footer className="birzha-legacy-drawer__footer">
              <ThemeToggle variant="labeled" />
            </footer>
          </aside>
        </>
      ) : null}
    </>
  );
}
