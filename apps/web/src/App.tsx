import { useLocation, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/auth-context.js";
import { defaultRouteForUser } from "./auth/role-panels.js";
import { AppNav } from "./components/AppNav.js";
import { CreateTripIfAllowed } from "./components/CreateTripIfAllowed.js";
import { AdminCabinetHome } from "./components/AdminCabinetHome.js";
import { SellerCabinetHome } from "./components/SellerCabinetHome.js";
import { SellerSalesOperationsRedirect } from "./components/SellerSalesOperationsRedirect.js";
import { AccountingCabinetHome } from "./components/AccountingCabinetHome.js";
import { CounterpartiesPanel } from "./components/CounterpartiesPanel.js";
import { LoginPage } from "./components/LoginPage.js";
import { AllocationPanel } from "./components/AllocationPanel.js";
import { OperationsPanel } from "./components/OperationsPanel.js";
import { PurchaseNakladnayaDetailSection } from "./components/PurchaseNakladnayaDetailSection.js";
import { PurchaseNakladnayaSection } from "./components/PurchaseNakladnayaSection.js";
import { RequireApiAuthGate } from "./components/RequireApiAuthGate.js";
import { RequireCabinet } from "./components/RequireCabinet.js";
import { RequirePanel } from "./components/RequirePanel.js";
import { TripReportPanel } from "./components/TripReportPanel.js";
import { LegacyPathRedirect } from "./components/LegacyPathRedirect.js";
import { InventoryAdminPanel } from "./components/InventoryAdminPanel.js";
import { OfflineQueuePanel } from "./components/OfflineQueuePanel.js";
import { legacyPathList, login, ops, prefix } from "./routes.js";
import { LoadingBlock } from "./ui/LoadingIndicator.js";
import { muted, preJson, errorText } from "./ui/styles.js";

function HomeRedirect() {
  const { ready, meta, user } = useAuth();
  if (!ready) {
    return (
      <div style={{ maxWidth: 400, margin: "2rem 1rem" }} role="status" aria-live="polite">
        <LoadingBlock label="Инициализация…" minHeight={72} />
      </div>
    );
  }
  const to = meta?.authApi === "enabled" && user ? defaultRouteForUser(user) : ops.reports;
  return <Navigate to={to} replace />;
}

function AppHeading() {
  const { pathname } = useLocation();
  if (pathname.startsWith(prefix.admin)) {
    return (
      <h1 className="birzha-page-title no-print">
        Биржа <span className="birzha-page-title__suffix">— админ</span>
      </h1>
    );
  }
  if (pathname.startsWith(prefix.operations)) {
    return (
      <h1 className="birzha-page-title no-print">
        Биржа <span className="birzha-page-title__suffix">— склад, закуп, рейс</span>
      </h1>
    );
  }
  if (pathname.startsWith(prefix.sales)) {
    return (
      <h1 className="birzha-page-title no-print">
        Биржа <span className="birzha-page-title__suffix">— продавец</span>
      </h1>
    );
  }
  if (pathname.startsWith(prefix.accounting)) {
    return (
      <h1 className="birzha-page-title no-print">
        Биржа <span className="birzha-page-title__suffix">— бухгалтерия</span>
      </h1>
    );
  }
  return <h1 className="birzha-page-title no-print">Биржа</h1>;
}

function ServicePage({ bootstrapError, metaJson }: { bootstrapError: Error | null; metaJson: string | null }) {
  return (
    <section className="birzha-card" aria-labelledby="service-heading">
      <h2 id="service-heading" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
        GET /api/meta
      </h2>
      {bootstrapError && (
        <p role="alert" style={errorText}>
          Нет ответа — запустите API.
        </p>
      )}
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

  return (
    <main className="app-shell">
      {showChrome ? (
        <header className="birzha-app-header no-print">
          <AppHeading />
          {import.meta.env.DEV ? (
            <p style={{ ...muted, marginBottom: "0.65rem" }}>
              Клиент: Vite + React + TanStack Query + React Router. API: <code>pnpm dev:api</code> на порту 3000, в dev —
              прокси <code> /api/…</code>.
            </p>
          ) : null}
          <AppNav />
        </header>
      ) : null}

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
                <Outlet />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <div className="no-print">
                      <CreateTripIfAllowed />
                    </div>
                    <TripReportPanel viewContext="default" />
                  </section>
                </RequirePanel>
              }
            />
            <Route path="trips" element={<Navigate to="reports" replace />} />
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
              path="offline"
              element={
                <RequirePanel panel="offline">
                  <section className="birzha-card">
                    <OfflineQueuePanel sectionStyle={{}} />
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
                <Outlet />
              </RequireCabinet>
            }
          >
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
                  <section className="birzha-card">
                    <AdminCabinetHome />
                  </section>
                </RequirePanel>
              }
            />
          </Route>

          <Route
            path={prefix.sales}
            element={
              <RequireCabinet id="sales">
                <Outlet />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <div className="no-print">
                      <CreateTripIfAllowed />
                    </div>
                    <TripReportPanel viewContext="sales" />
                  </section>
                </RequirePanel>
              }
            />
            <Route path="operations" element={<SellerSalesOperationsRedirect />} />
            <Route
              path="offline"
              element={
                <RequirePanel panel="offline">
                  <section className="birzha-card">
                    <OfflineQueuePanel sectionStyle={{}} />
                  </section>
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
                <Outlet />
              </RequireCabinet>
            }
          >
            <Route
              path="reports"
              element={
                <RequirePanel panel="reports">
                  <section className="birzha-card">
                    <div className="no-print">
                      <CreateTripIfAllowed />
                    </div>
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
    </main>
  );
}
