import { Suspense, lazy } from "react";
import { useLocation, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/auth-context.js";
import { defaultRouteForUser } from "./auth/role-panels.js";
import {
  AccountingCabinetLayout,
  AdminCabinetLayout,
  OperationsCabinetLayout,
  SalesCabinetLayout,
} from "./components/CabinetShellLayout.js";
import { LegacyChrome } from "./components/LegacyChrome.js";
import { LegacyPathRedirect } from "./components/LegacyPathRedirect.js";
import { LoginPage } from "./components/LoginPage.js";
import { RequireApiAuthGate } from "./components/RequireApiAuthGate.js";
import { RequireCabinet } from "./components/RequireCabinet.js";
import { RequirePanel } from "./components/RequirePanel.js";
import { StaleMetaBanner } from "./components/StaleMetaBanner.js";
import { legacyPathList, login, ops, prefix } from "./routes.js";
import { LoadingScreen } from "./ui/LoadingIndicator.js";
import { ErrorAlert } from "./ui/ErrorAlerts.js";
import { preJson } from "./ui/styles.js";

const AccountingCabinetHome = lazy(() =>
  import("./components/AccountingCabinetHome.js").then((m) => ({ default: m.AccountingCabinetHome })),
);
const AdminCabinetHome = lazy(() =>
  import("./components/AdminCabinetHome.js").then((m) => ({ default: m.AdminCabinetHome })),
);
const AdminUsersPanel = lazy(() =>
  import("./components/AdminUsersPanel.js").then((m) => ({ default: m.AdminUsersPanel })),
);
const AdminLoadingManifestsPanel = lazy(() =>
  import("./components/AdminLoadingManifestsPanel.js").then((m) => ({ default: m.AdminLoadingManifestsPanel })),
);
const AdminSoldBySellerPage = lazy(() =>
  import("./components/AdminSoldBySellerPage.js").then((m) => ({ default: m.AdminSoldBySellerPage })),
);
const AdminStockWarehousesPage = lazy(() =>
  import("./components/AdminStockWarehousesPage.js").then((m) => ({ default: m.AdminStockWarehousesPage })),
);
const AdminWarehouseWriteOffsLedgerPage = lazy(() =>
  import("./components/AdminWarehouseWriteOffsLedgerPage.js").then((m) => ({
    default: m.AdminWarehouseWriteOffsLedgerPage,
  })),
);
const AdminTransitTripsPage = lazy(() =>
  import("./components/AdminTransitTripsPage.js").then((m) => ({ default: m.AdminTransitTripsPage })),
);
const AdminTripRegistryPage = lazy(() =>
  import("./components/AdminTripRegistryPage.js").then((m) => ({ default: m.AdminTripRegistryPage })),
);
const AssignSellerPanel = lazy(() =>
  import("./components/AssignSellerPanel.js").then((m) => ({ default: m.AssignSellerPanel })),
);
const SellerDispatchPanel = lazy(() =>
  import("./components/SellerDispatchPanel.js").then((m) => ({ default: m.SellerDispatchPanel })),
);
const AllocationPanel = lazy(() =>
  import("./components/AllocationPanel.js").then((m) => ({ default: m.AllocationPanel })),
);
const CounterpartiesPanel = lazy(() =>
  import("./components/CounterpartiesPanel.js").then((m) => ({ default: m.CounterpartiesPanel })),
);
const AdminTripsLogisticsPanel = lazy(() =>
  import("./components/AdminTripsLogisticsPanel.js").then((m) => ({ default: m.AdminTripsLogisticsPanel })),
);
const InventoryAdminPanel = lazy(() =>
  import("./components/InventoryAdminPanel.js").then((m) => ({ default: m.InventoryAdminPanel })),
);
const OperationsPanel = lazy(() =>
  import("./components/OperationsPanel.js").then((m) => ({ default: m.OperationsPanel })),
);
const PurchaseNakladnayaDetailSection = lazy(() =>
  import("./components/PurchaseNakladnayaDetailSection.js").then((m) => ({
    default: m.PurchaseNakladnayaDetailSection,
  })),
);
const PurchaseNakladnayaSection = lazy(() =>
  import("./components/PurchaseNakladnayaSection.js").then((m) => ({ default: m.PurchaseNakladnayaSection })),
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
const ArchivePage = lazy(() =>
  import("./components/ArchivePage.js").then((m) => ({ default: m.ArchivePage })),
);

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

function ServicePage({ bootstrapError, metaJson }: { bootstrapError: Error | null; metaJson: string | null }) {
  return (
    <section className="birzha-card" aria-labelledby="service-heading">
      <h2 id="service-heading" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
        Диагностика сервера
      </h2>
      {bootstrapError ? (
        <ErrorAlert title="Сервер недоступен" message="Сервер временно недоступен." />
      ) : null}
      {!bootstrapError && metaJson && (
        <pre style={preJson} tabIndex={0} aria-label="JSON ответа GET /api/meta">
          {metaJson}
        </pre>
      )}
    </section>
  );
}

export function App() {
  const { meta, bootstrapError } = useAuth();
  const metaJson = meta ? JSON.stringify(meta, null, 2) : null;
  const { pathname } = useLocation();
  const showChrome = pathname !== login;
  const cabinetShell = isCabinetShellPath(pathname);
  const legacyStickyHeader = showChrome && !cabinetShell;

  return (
    <main
      className={`app-shell${cabinetShell ? " app-shell--cabinet" : ""}${legacyStickyHeader ? " app-shell--legacy-sticky-header" : ""}`}
    >
      {showChrome && !cabinetShell ? <LegacyChrome /> : null}
      <StaleMetaBanner />

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
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <TripReportPanel viewContext="default" />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="purchase-nakladnaya"
              element={
                <RequirePanel panel="nakladnaya">
                  <section className="birzha-card">
                    <Outlet />
                  </section>
                </RequirePanel>
              }
            >
              <Route index element={<PurchaseNakladnayaSection />} />
              <Route path=":documentId" element={<PurchaseNakladnayaDetailSection />} />
            </Route>
            <Route
              path="distribution"
              element={
                <RequirePanel panel="distribution">
                  <section className="birzha-card">
                    <AllocationPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="trips"
              element={
                <RequirePanel panel="trips">
                  <AdminTripsLogisticsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="archive"
              element={
                <RequirePanel panel="archive">
                  <ArchivePage />
                </RequirePanel>
              }
            />
            <Route
              path="operations"
              element={
                <RequirePanel panel="operations">
                  <section className="birzha-card">
                    <OperationsPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="loading-manifests"
              element={
                <RequirePanel panel="loadingManifests">
                  <AdminLoadingManifestsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="loading-manifests/:manifestId"
              element={
                <RequirePanel panel="loadingManifests">
                  <AdminLoadingManifestsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="seller-dispatch"
              element={
                <RequirePanel panel="sellerDispatch">
                  <section className="birzha-card">
                    <SellerDispatchPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="assign-seller"
              element={
                <RequirePanel panel="assignSeller">
                  <section className="birzha-card">
                    <AssignSellerPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route index element={<Navigate to="reports" replace />} />
          </Route>

          <Route
            path={prefix.admin}
            element={
              <RequireCabinet id="admin">
                <AdminCabinetLayout />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <TripReportPanel viewContext="default" />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="purchase-nakladnaya"
              element={
                <RequirePanel panel="nakladnaya">
                  <section className="birzha-card">
                    <Outlet />
                  </section>
                </RequirePanel>
              }
            >
              <Route index element={<PurchaseNakladnayaSection />} />
              <Route path=":documentId" element={<PurchaseNakladnayaDetailSection />} />
            </Route>
            <Route
              path="distribution"
              element={
                <RequirePanel panel="distribution">
                  <section className="birzha-card">
                    <AllocationPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="trips"
              element={
                <RequirePanel panel="trips">
                  <AdminTripsLogisticsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="archive"
              element={
                <RequirePanel panel="archive">
                  <ArchivePage />
                </RequirePanel>
              }
            />
            <Route
              path="loading-manifests"
              element={
                <RequirePanel panel="loadingManifests">
                  <AdminLoadingManifestsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="loading-manifests/:manifestId"
              element={
                <RequirePanel panel="loadingManifests">
                  <AdminLoadingManifestsPanel />
                </RequirePanel>
              }
            />
            <Route
              path="seller-dispatch"
              element={
                <RequirePanel panel="sellerDispatch">
                  <section className="birzha-card">
                    <SellerDispatchPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="assign-seller"
              element={
                <RequirePanel panel="assignSeller">
                  <section className="birzha-card">
                    <AssignSellerPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="operations"
              element={
                <RequirePanel panel="operations">
                  <section className="birzha-card">
                    <OperationsPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="trip-registry"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <AdminTripRegistryPage />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="transit-trips"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <AdminTransitTripsPage />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="sold-by-seller"
              element={
                <RequirePanel panel="assignSeller">
                  <section className="birzha-card">
                    <AdminSoldBySellerPage />
                  </section>
                </RequirePanel>
              }
            />
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
              element={
                <RequirePanel panel="inventory">
                  <section className="birzha-card">
                    <AdminWarehouseWriteOffsLedgerPage />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="inventory"
              element={
                <RequirePanel panel="inventory">
                  <section className="birzha-card">
                    <InventoryAdminPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="users"
              element={
                <RequirePanel panel="users">
                  <AdminUsersPanel />
                </RequirePanel>
              }
            />
            <Route
              path="service"
              element={
                <RequirePanel panel="service">
                  <ServicePage bootstrapError={bootstrapError} metaJson={metaJson} />
                </RequirePanel>
              }
            />
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
            <Route
              path="seller-dispatch"
              element={
                <RequirePanel panel="sellerDispatch">
                  <section className="birzha-card">
                    <SellerDispatchPanel />
                  </section>
                </RequirePanel>
              }
            />
            <Route
              path="trade"
              element={
                <RequirePanel panel="assignSeller">
                  <section className="birzha-card">
                    <AssignSellerPanel />
                  </section>
                </RequirePanel>
              }
            />
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
