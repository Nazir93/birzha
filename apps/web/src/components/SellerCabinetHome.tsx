import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet, isFieldSellerOnly } from "../auth/role-panels.js";
import {
  aggregateSellerShipmentReports,
  gramsToDashboardKg,
  sumSellerSettlementFromReports,
} from "../format/seller-trip-metrics.js";
import {
  filterTripsAssignedToSellerForReports,
  isTripOpenForSellerWorkspace,
} from "../format/seller-workspace-trips.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { shipmentReportQueryOptions, tripsPickerQueryOptions } from "../query/core-list-queries.js";
import { ops, sales } from "../routes.js";
import { formatDashboardKg } from "./dashboard/dashboard-summary-ui.js";
import { SellFromTripSection } from "./SellFromTripSection.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";

const SELL_FORM_ID = "seller-sell";

/**
 * Сводка продавца: компактные KPI, сразу форма продажи.
 * Траты и детализация по рейсу — в боковом меню.
 */
export function SellerCabinetHome() {
  const { user } = useAuth();
  const canOpsCabinet = user ? canAccessCabinet(user, "operations") : false;
  const fieldSellerOnly = user ? isFieldSellerOnly(user) : false;
  const sellerId = user?.id?.trim() ?? "";

  const tripsQ = useQuery(tripsPickerQueryOptions({ limit: 500, status: "open" }));
  const assignedOpen = useMemo(() => {
    if (!sellerId) {
      return [];
    }
    return filterTripsAssignedToSellerForReports(tripsQ.data?.trips ?? [], sellerId).filter(
      isTripOpenForSellerWorkspace,
    );
  }, [sellerId, tripsQ.data?.trips]);

  const reportsQ = useQueries({
    queries: assignedOpen.map((t) => shipmentReportQueryOptions(t.id)),
  });

  const reports = useMemo(
    () => reportsQ.map((q) => q.data).filter((row): row is NonNullable<typeof row> => row != null),
    [reportsQ],
  );

  const totals = useMemo(() => aggregateSellerShipmentReports(reports), [reports]);
  const settlement = useMemo(() => sumSellerSettlementFromReports(reports), [reports]);
  const remainingKg = gramsToDashboardKg(totals.netTransit);
  const soldKg = gramsToDashboardKg(totals.sold);

  const reportsPending = assignedOpen.length > 0 && reportsQ.some((q) => q.isPending);
  const reportsFailed = reportsQ.some((q) => q.isError);

  return (
    <div className="birzha-admin-dash birzha-seller-workspace">
      <h2 className="birzha-sr-only">Сводка продавца</h2>

      {tripsQ.isPending ? (
        <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={3} />
      ) : null}
      {tripsQ.isError ? (
        <ErrorAlert error={tripsQ.error} title="Сводка" message="Не удалось загрузить рейсы." />
      ) : null}

      {!tripsQ.isPending && !tripsQ.isError ? (
        <>
          <header className="birzha-admin-dash-modern__hero">
            <div>
              <p className="birzha-home-hero__eyebrow">Продажи</p>
              <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0", maxWidth: "36rem" }}>
                Продажа с рейса — сразу ниже. Траты и отчёт — в меню слева.
              </p>
            </div>
            <nav className="birzha-admin-dash-modern__actions no-print" aria-label="Быстрые действия">
              <a href={`#${SELL_FORM_ID}`} className="birzha-home-action">
                <strong>Продажа</strong>
              </a>
              <Link to={sales.reports} className="birzha-home-action">
                <strong>Отчёт</strong>
              </Link>
              <Link to={sales.expenses} className="birzha-home-action">
                <strong>Траты</strong>
              </Link>
              <Link to={sales.archive} className="birzha-home-action">
                <strong>Архив</strong>
              </Link>
              {!fieldSellerOnly && canOpsCabinet ? (
                <Link to={ops.operations} className="birzha-home-action">
                  <strong>Склад</strong>
                </Link>
              ) : null}
            </nav>
          </header>

          {reportsFailed ? (
            <ErrorAlert message="Часть отчётов по рейсам не загрузилась. Обновите страницу." title="Сводка" />
          ) : null}

          {reportsPending ? (
            <LoadingBlock label="Считаем итоги по рейсам…" minHeight={48} skeleton skeletonRows={2} />
          ) : null}

          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Итоги по открытым рейсам">
            <a
              href={`#${SELL_FORM_ID}`}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent birzha-kpi-tile--link"
              title="Остаток на машине — к форме продажи"
            >
              <div className="birzha-kpi-tile__label">На машине</div>
              <div className="birzha-kpi-tile__value">{formatDashboardKg(remainingKg)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">Осталось продать</div>
            </a>
            <Link
              to={sales.reports}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--violet birzha-kpi-tile--link"
              title="Продано с закреплённых рейсов"
            >
              <div className="birzha-kpi-tile__label">Продано</div>
              <div className="birzha-kpi-tile__value">{formatDashboardKg(soldKg)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">Открытые рейсы</div>
            </Link>
            <Link
              to={sales.expenses}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber birzha-kpi-tile--link"
              title="Наличные к сдаче"
            >
              <div className="birzha-kpi-tile__label">К сдаче</div>
              <div className="birzha-kpi-tile__value">{kopecksToRubDisplay(settlement.cashToHandOverKopecks.toString())} ₽</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">Нал минус траты</div>
            </Link>
          </section>
        </>
      ) : null}

      <div id={SELL_FORM_ID} className="birzha-seller-sell-wrap">
        <SellFromTripSection />
      </div>
    </div>
  );
}
