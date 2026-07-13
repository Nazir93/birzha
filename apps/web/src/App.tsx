import { Suspense, lazy } from "react";
import { useLocation, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/auth-context.js";
import { defaultRouteForUser } from "./auth/role-panels.js";
import {
  AccountingCabinetLayout,
  AdminCabinetLayout,
  OperationsCabinetLayout,
  SalesCabinetLayout,
} from "./components/CabinetShellLayout.js";
import { LegacyPathRedirect } from "./components/LegacyPathRedirect.js";
import { LoginPage } from "./components/LoginPage.js";
import { RequireApiAuthGate } from "./components/RequireApiAuthGate.js";
import { RequireCabinet } from "./components/RequireCabinet.js";
import { RequirePanel } from "./components/RequirePanel.js";
import { sharedOperationsCabinetRouteElements } from "./routing/shared-operations-routes.js";
import { accounting, adminRoutes, legacyPathList, login, ops, prefix } from "./routes.js";
import { LoadingScreen } from "./ui/LoadingIndicator.js";

const AccountingCabinetHome = lazy(() =>
  import("./components/AccountingCabinetHome.js").then((m) => ({ default: m.AccountingCabinetHome })),
);
const AdminCabinetHome = lazy(() =>
  import("./components/AdminCabinetHome.js").then((m) => ({ default: m.AdminCabinetHome })),
);
const AdminUsersPanel = lazy(() =>
  import("./components/AdminUsersPanel.js").then((m) => ({ default: m.AdminUsersPanel })),
);
const AdminStockWarehousesPage = lazy(() =>
  import("./components/AdminStockWarehousesPage.js").then((m) => ({ default: m.AdminStockWarehousesPage })),
);
const WarehouseReturnsPage = lazy(() =>
  import("./components/WarehouseReturnsPage.js").then((m) => ({ default: m.WarehouseReturnsPage })),
);
const CounterpartiesPanel = lazy(() =>
  import("./components/CounterpartiesPanel.js").then((m) => ({ default: m.CounterpartiesPanel })),
);
const InventoryAdminPanel = lazy(() =>
  import("./components/InventoryAdminPanel.js").then((m) => ({ default: m.InventoryAdminPanel })),
);
const SettingsAdminLayout = lazy(() =>
  import("./components/SettingsAdminLayout.js").then((m) => ({ default: m.SettingsAdminLayout })),
);
const SettingsDocumentsAdminPanel = lazy(() =>
  import("./components/SettingsDocumentsAdminPanel.js").then((m) => ({ default: m.SettingsDocumentsAdminPanel })),
);
const SellerCabinetHome = lazy(() =>
  import("./components/SellerCabinetHome.js").then((m) => ({ default: m.SellerCabinetHome })),
);
const SellerSalesOperationsRedirect = lazy(() =>
  import("./components/SellerSalesOperationsRedirect.js").then((m) => ({ default: m.SellerSalesOperationsRedirect })),
);
const TripReportPanel = lazy(() =>
  import("./components/TripReportPanel.js").then((m) => ({ default: m.TripReportPanel })),
);
const ArchivePage = lazy(() => import("./components/ArchivePage.js").then((m) => ({ default: m.ArchivePage })));

function isCabinetShellPath(pathname: string): boolean {
  const roots = [prefix.admin, prefix.operations, prefix.sales, prefix.accounting] as const;
  return roots.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function HomeRedirect() {
  const { ready, meta, user } = useAuth();
  if (!ready) {
    return <LoadingScreen label="Инициализация…" />;
  }
  const to = meta?.authApi === "enabled" && user ? defaultRouteForUser(user) : ops.reports;
  return <Navigate to={to} replace />;
}

function RouteFallback() {
  return <LoadingScreen label="Загрузка раздела…" />;
}

export function App() {
  const { pathname } = useLocation();
  const cabinetShell = isCabinetShellPath(pathname);

  return (
    <main className={`app-shell${cabinetShell ? " app-shell--cabinet" : ""}`}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path={login} element={<LoginPage />} />
          <Route element={<RequireApiAuthGate />}>
            <Route path="/" element={<HomeRedirect />} />
            {legacyPathList.map((p) => (
              <Route key={p} path={p} element={<LegacyPathRedirect />} />
            ))}

          <Route
            path={prefix.operations}
            element={
              <RequireCabinet id="operations">
                <OperationsCabinetLayout />
              </RequireCabinet>
            }
          >
            {sharedOperationsCabinetRouteElements("reports")}
          </Route>

          <Route
            path={prefix.admin}
            element={
              <RequireCabinet id="admin">
                <AdminCabinetLayout />
              </RequireCabinet>
            }
          >
            {sharedOperationsCabinetRouteElements("home")}
            <Route path="trip-registry" element={<Navigate to={adminRoutes.trips} replace />} />
            <Route path="transit-trips" element={<Navigate to={adminRoutes.reports} replace />} />
            <Route path="sold-by-seller" element={<Navigate to={adminRoutes.assignSeller} replace />} />
            <Route
              path="stock-warehouses"
              element={
                <RequirePanel panel="inventory">
                  <section className="birzha-card">
                    <AdminStockWarehousesPage />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="warehouse-write-offs"
              element={<Navigate to={adminRoutes.warehouseReturns} replace />}
            />
            <Route
              path="warehouse-returns"
              element={
                <RequirePanel panel="warehouseReturns">
                  <section className="birzha-card">
                    <WarehouseReturnsPage />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="settings"
              element={
                <RequirePanel panel="settings">
                  <section className="birzha-card">
                    <SettingsAdminLayout />
                  </section>
                </RequirePanel>
              }
            >
              <Route index element={<Navigate to="catalog" replace />} />
              <Route path="catalog" element={<InventoryAdminPanel embedded />} />
              <Route path="documents" element={<SettingsDocumentsAdminPanel embedded />} />
              <Route path="team" element={<AdminUsersPanel embedded />} />
            </Route>
            <Route path="inventory" element={<Navigate to={adminRoutes.settingsCatalog} replace />} />
            <Route path="users" element={<Navigate to={adminRoutes.settingsTeam} replace />} />
            <Route path="service" element={<Navigate to={adminRoutes.home} replace />} />
            <Route
              index
              element={
                <RequirePanel panel="reports">
                  <AdminCabinetHome />
                </RequirePanel>
              }
            />
          </Route>

          <Route
            path={prefix.sales}
            element={
              <RequireCabinet id="sales">
                <SalesCabinetLayout />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <TripReportPanel viewContext="sales" />
                  </section>
                </RequirePanel>
              }
            />
            <Route path="operations" element={<SellerSalesOperationsRedirect />} />
            <Route
              path="archive"
              element={
                <RequirePanel panel="archive">
                  <ArchivePage />
                </RequirePanel>
              }
            />
            <Route
              index
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <SellerCabinetHome />
                  </section>
                </RequirePanel>
              }
            />
          </Route>

          <Route
            path={prefix.accounting}
            element={
              <RequireCabinet id="accounting">
                <AccountingCabinetLayout />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <TripReportPanel viewContext="accounting" />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="counterparties"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <CounterpartiesPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route path="seller-dispatch" element={<Navigate to={accounting.home} replace />} />
            <Route path="trade" element={<Navigate to={accounting.home} replace />} />
            <Route
              index
              element={
                <RequirePanel panel="reports">
                  <AccountingCabinetHome />
                </RequirePanel>
              }
            />
          </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </Suspense>
    </main>
  );
}
