import { lazy } from "react";
import { Navigate, Outlet, Route } from "react-router-dom";

import { RedirectLoadingManifestRoute } from "./RedirectLoadingManifestRoute.js";
import { RedirectSellerDispatchRoute } from "./RedirectSellerDispatchRoute.js";

import { RequirePanel } from "../components/RequirePanel.js";

const TripReportPanel = lazy(() =>
  import("../components/TripReportPanel.js").then((m) => ({ default: m.TripReportPanel })),
);
const PurchaseNakladnayaSection = lazy(() =>
  import("../components/PurchaseNakladnayaSection.js").then((m) => ({ default: m.PurchaseNakladnayaSection })),
);
const PurchaseNakladnayaDetailSection = lazy(() =>
  import("../components/PurchaseNakladnayaDetailSection.js").then((m) => ({
    default: m.PurchaseNakladnayaDetailSection,
  })),
);
const AllocationPanel = lazy(() =>
  import("../components/AllocationPanel.js").then((m) => ({ default: m.AllocationPanel })),
);
const AdminTripsLogisticsPanel = lazy(() =>
  import("../components/AdminTripsLogisticsPanel.js").then((m) => ({ default: m.AdminTripsLogisticsPanel })),
);
const LoadingAppendPanel = lazy(() =>
  import("../components/LoadingAppendPanel.js").then((m) => ({ default: m.LoadingAppendPanel })),
);
const LoadingTripPanel = lazy(() =>
  import("../components/LoadingTripPanel.js").then((m) => ({ default: m.LoadingTripPanel })),
);
const WarehouseReturnsPage = lazy(() =>
  import("../components/WarehouseReturnsPage.js").then((m) => ({ default: m.WarehouseReturnsPage })),
);
const ArchivePage = lazy(() => import("../components/ArchivePage.js").then((m) => ({ default: m.ArchivePage })));
const OperationsPanel = lazy(() =>
  import("../components/OperationsPanel.js").then((m) => ({ default: m.OperationsPanel })),
);
const AssignSellerPanel = lazy(() =>
  import("../components/AssignSellerPanel.js").then((m) => ({ default: m.AssignSellerPanel })),
);

/**
 * Общие панели закупа/склада/логистики в кабинетах `/o` и `/a`.
 * Вызывать как `{sharedOperationsCabinetRouteElements("reports")}` внутри родительского `<Route>` —
 * не как `<Component />` (React Router требует прямых потомков `<Route>`).
 */
export function sharedOperationsCabinetRouteElements(defaultIndex: "reports" | "home") {
  return (
    <>
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
              <Outlet />
            </section>
          </RequirePanel>
        }
      >
        <Route index element={<AllocationPanel />} />
        <Route path=":manifestId" element={<AllocationPanel />} />
      </Route>
      <Route
        path="loading-append"
        element={
          <RequirePanel panel="loadingAppend">
            <section className="birzha-card">
              <Outlet />
            </section>
          </RequirePanel>
        }
      >
        <Route index element={<LoadingAppendPanel />} />
        <Route path=":manifestId" element={<LoadingAppendPanel />} />
      </Route>
      <Route
        path="loading-trip"
        element={
          <RequirePanel panel="loadingTrip">
            <section className="birzha-card">
              <Outlet />
            </section>
          </RequirePanel>
        }
      >
        <Route index element={<LoadingTripPanel />} />
        <Route path=":manifestId" element={<LoadingTripPanel />} />
      </Route>
      <Route
        path="trips"
        element={
          <RequirePanel panel="trips">
            <section className="birzha-card">
              <AdminTripsLogisticsPanel />
            </section>
          </RequirePanel>
        }
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
          <RequirePanel panel="distribution">
            <RedirectLoadingManifestRoute />
          </RequirePanel>
        }
      />
      <Route
        path="loading-manifests/:manifestId"
        element={
          <RequirePanel panel="distribution">
            <RedirectLoadingManifestRoute />
          </RequirePanel>
        }
      />
      <Route
        path="seller-dispatch"
        element={
          <RequirePanel panel="assignSeller">
            <RedirectSellerDispatchRoute />
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
      {defaultIndex === "reports" ? <Route index element={<Navigate to="reports" replace />} /> : null}
    </>
  );
}
