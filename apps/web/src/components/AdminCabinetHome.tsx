import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import {
  adminDashboardSummaryQueryOptions,
  loadingManifestsPagedQueryOptions,
  queryRoots,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import {
  buildMassSegments,
  gradeTableRows,
  warehouseTableRows,
} from "../format/admin-dashboard-summary-rows.js";
import { buildAdminSummaryAlerts } from "../format/admin-summary-alerts.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { groupLoadingManifestsForList } from "../format/loading-manifest-list.js";
import { formatTripListStatusLabel, tripListFullySold } from "../format/trip-label.js";
import { filterTripsInWork } from "../format/archive.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { adminRoutes, accounting } from "../routes.js";
import { tripReportHref } from "../format/trip-report-href.js";
import {
  DashboardSummaryPeriodToggles,
  MassBalanceLegend,
  MassDistributionRing,
  SummaryStockTable,
  SummaryTotalsStrip,
  dashboardPeriodStartDate,
  formatDashboardKg,
  type DashboardSummaryChartMode,
  type DashboardSummaryPeriod,
} from "./dashboard/dashboard-summary-ui.js";
import { AdminSummaryAttention } from "./admin/AdminSummaryAttention.js";
import { AdminPushNotificationsCard } from "./AdminPushNotificationsCard.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { WORK_LIST_PAGE_SIZE, clampListPageIndex, listPageCount, sliceListPage } from "../format/list-page-sizes.js";

const ADMIN_TRIPS_SECTION_ID = "admin-trips-in-work";

/**
 * Дашборд администратора: KPI, распределение массы, сводка по складам, рейсы.
 */
export function AdminCabinetHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showCloseTrip = canCreateTrip(user ?? null);
  const [summaryChartMode, setSummaryChartMode] = useState<DashboardSummaryChartMode>("mass");
  const [summaryPeriod, setSummaryPeriod] = useState<DashboardSummaryPeriod>("30d");

  /** Сводка → отчёт: два шага в истории, чтобы «Назад» вернул к выбору рейса, а не сразу на сводку. */
  const openTripReport = (tripId: string) => {
    const id = tripId.trim();
    if (!id) {
      return;
    }
    const withTrip = tripReportHref(adminRoutes.reports, id);
    void navigate(adminRoutes.reports);
    queueMicrotask(() => {
      void navigate(withTrip);
    });
  };

  const periodStart = useMemo(() => dashboardPeriodStartDate(summaryPeriod), [summaryPeriod]);
  const sinceParam = periodStart ? periodStart.toISOString().slice(0, 10) : undefined;

  const summaryQ = useQuery({
    ...adminDashboardSummaryQueryOptions(sinceParam),
    refetchOnMount: "always",
  });
  const tripsQ = useQuery(tripsPickerQueryOptions({ limit: 500, status: "open" }));
  const activeManifestsQ = useQuery(
    loadingManifestsPagedQueryOptions({ limit: 30, offset: 0, scope: "active" }),
  );

  const aggregates = useMemo(() => {
    const summary = summaryQ.data;
    if (!summary) {
      return {
        tripsOpen: 0,
        tripsClosed: 0,
        batchCount: 0,
        warehouseKg: 0,
        soldKg: 0,
        dispatchedKg: 0,
        inTripRemainingKg: 0,
        shortageKg: 0,
        loadingManifestKg: 0,
        loadingManifestCount: 0,
        loadingManifestsWithoutTrip: 0,
        loadingManifestsWithoutTripKg: 0,
        unassignedOpenTripsCount: 0,
        stockTotals: { kg: 0, packages: 0, valueKopecks: "0" },
        byGrade: [],
        byWarehouse: [],
      };
    }
    return {
      tripsOpen: summary.trips.openCount,
      tripsClosed: summary.trips.closedCount,
      batchCount: summary.warehouse.batchCount,
      warehouseKg: summary.warehouse.warehouseKg,
      soldKg: summary.trips.soldKg,
      dispatchedKg: summary.trips.remainingInTripKg,
      inTripRemainingKg: summary.trips.remainingInTripKg,
      shortageKg: summary.trips.shortageKg,
      loadingManifestKg: summary.loadingManifests.activeKg,
      loadingManifestCount: summary.loadingManifests.activeCount,
      loadingManifestsWithoutTrip: summary.loadingManifests.withoutTripCount,
      loadingManifestsWithoutTripKg: summary.loadingManifests.withoutTripKg,
      unassignedOpenTripsCount: summary.attention.unassignedOpenTripsCount,
      stockTotals: summary.warehouse.stockTotals,
      byGrade: summary.warehouse.byGrade,
      byWarehouse: summary.warehouse.byWarehouse,
    };
  }, [summaryQ.data]);

  const sortedTripsOpen = useMemo(
    () => sortTripsByDepartedDesc(filterTripsInWork(tripsQ.data?.trips ?? [])),
    [tripsQ.data?.trips],
  );

  const tripNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tripsQ.data?.trips ?? []) {
      map.set(t.id, t.tripNumber);
    }
    return map;
  }, [tripsQ.data?.trips]);

  const activeManifestListRows = useMemo(
    () => groupLoadingManifestsForList(activeManifestsQ.data?.loadingManifests ?? []),
    [activeManifestsQ.data?.loadingManifests],
  );

  const [tripsPage, setTripsPage] = useState(0);
  const tripsPageCount = listPageCount(sortedTripsOpen.length, WORK_LIST_PAGE_SIZE);

  useEffect(() => {
    setTripsPage((p) => clampListPageIndex(p, sortedTripsOpen.length, WORK_LIST_PAGE_SIZE));
  }, [sortedTripsOpen.length]);

  const tripsPageSlice = useMemo(
    () => sliceListPage(sortedTripsOpen, tripsPage, WORK_LIST_PAGE_SIZE),
    [sortedTripsOpen, tripsPage],
  );

  const gradeRows = useMemo(() => gradeTableRows(aggregates.byGrade), [aggregates.byGrade]);
  const warehouseRows = useMemo(() => warehouseTableRows(aggregates.byWarehouse), [aggregates.byWarehouse]);
  const summaryTableMaxKg = useMemo(() => {
    const rows = summaryChartMode === "mass" ? gradeRows : warehouseRows;
    return rows[0]?.kg ?? 0;
  }, [gradeRows, summaryChartMode, warehouseRows]);

  const massSegments = useMemo(
    () =>
      buildMassSegments({
        warehouseKg: aggregates.warehouseKg,
        loadingManifestKg: aggregates.loadingManifestKg,
        inTripRemainingKg: aggregates.inTripRemainingKg,
        soldKg: aggregates.soldKg,
      }),
    [
      aggregates.inTripRemainingKg,
      aggregates.loadingManifestKg,
      aggregates.soldKg,
      aggregates.warehouseKg,
    ],
  );

  const showMassChart = summaryChartMode === "mass";
  const showWarehouseChart = summaryChartMode === "warehouses";
  const openTripsReadyToClose = useMemo(
    () => sortedTripsOpen.filter((t) => t.status === "open" && tripListFullySold(t)).length,
    [sortedTripsOpen],
  );

  const summaryAlerts = useMemo(
    () =>
      buildAdminSummaryAlerts({
        loadingManifestsWithoutTrip: aggregates.loadingManifestsWithoutTrip,
        openTripsReadyToClose,
        unassignedOpenTripsCount: aggregates.unassignedOpenTripsCount,
        distributionRoute: adminRoutes.distribution,
        assignSellerRoute: adminRoutes.assignSeller,
        tripsSectionHash: `#${ADMIN_TRIPS_SECTION_ID}`,
      }),
    [
      aggregates.loadingManifestsWithoutTrip,
      aggregates.unassignedOpenTripsCount,
      openTripsReadyToClose,
    ],
  );

  const loading = summaryQ.isPending;
  const summaryFailed = summaryQ.isError;
  const tripsFailed = tripsQ.isError;

  const closeTripMut = useMutation({
    mutationFn: async (tripId: string) => {
      const t = (tripsQ.data?.trips ?? []).find((x) => x.id === tripId);
      if (!t) {
        throw new Error("Рейс не найден в списке");
      }
      if (!tripListFullySold(t)) {
        const ok = window.confirm("Погруженный остаток в рейсе ещё не ноль. Закрыть рейс?");
        if (!ok) {
          return;
        }
      }
      await closeTripById(tripId, "Нет прав: закрытие рейса — роли admin, manager, logistics");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    },
  });

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка админки</h2>

      {loading && <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={5} />}
      {summaryFailed ? (
        <ErrorAlert error={summaryQ.error} message="Не удалось загрузить сводку. Обновите страницу (Ctrl+Shift+R)." title="Сводка" />
      ) : null}
      {!loading && !summaryFailed && (
        <>
          <header className="birzha-admin-dash-modern__hero">
            <div>
              <p className="birzha-home-hero__eyebrow">Панель управления</p>
              <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
                <DashboardSummaryPeriodToggles period={summaryPeriod} onChange={setSummaryPeriod} />
              </div>
            </div>
            <nav className="birzha-admin-dash-modern__actions no-print" aria-label="Быстрые действия">
              <Link to={adminRoutes.purchaseNakladnaya} className="birzha-home-action">
                <strong>Закупка</strong>
              </Link>
              <Link to={adminRoutes.trips} className="birzha-home-action">
                <strong>Рейсы</strong>
              </Link>
              <Link to={adminRoutes.distribution} className="birzha-home-action">
                <strong>Погрузка</strong>
              </Link>
              <Link to={adminRoutes.assignSeller} className="birzha-home-action">
                <strong>Продажи</strong>
              </Link>
            </nav>
          </header>

          <AdminPushNotificationsCard />

          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi">
              <Link
                to={adminRoutes.stockWarehouses}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent birzha-kpi-tile--link"
                title="Физический остаток на складах (без массы в пути)"
              >
                <div className="birzha-kpi-tile__label">Остаток на складе</div>
                <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.warehouseKg)}</div>
                <div className="birzha-kpi-tile__hint birzha-ui-sm">Только склад</div>
              </Link>
              <Link
                to={adminRoutes.distribution}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--violet birzha-kpi-tile--link"
                title="Погрузочные накладные в работе"
              >
                <div className="birzha-kpi-tile__label">
                  В погрузочных
                  {aggregates.loadingManifestsWithoutTrip > 0 ? (
                    <span className="birzha-kpi-tile__badge">
                      {aggregates.loadingManifestsWithoutTrip} без рейса
                    </span>
                  ) : null}
                </div>
                <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.loadingManifestKg)}</div>
                <div className="birzha-kpi-tile__hint birzha-ui-sm">ПН в работе</div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber birzha-kpi-tile--link"
                title="Остаток в открытых рейсах (отгружено − продано − недостача)"
              >
                <div className="birzha-kpi-tile__label">В открытых рейсах</div>
                <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.dispatchedKg)}</div>
                <div className="birzha-kpi-tile__hint birzha-ui-sm">Только открытые рейсы</div>
              </Link>
              <Link
                to={adminRoutes.assignSeller}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue birzha-kpi-tile--link"
                title="Продано с открытых рейсов"
              >
                <div className="birzha-kpi-tile__label">Продано</div>
                <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.soldKg)}</div>
                <div className="birzha-kpi-tile__hint birzha-ui-sm">С открытых рейсов</div>
              </Link>
          </section>

          <div className="birzha-admin-dash-modern__layout">
            <section className="birzha-admin-dash-modern__chart-card">
              <div className="birzha-admin-dash-modern__chart-head">
                <h4 style={{ margin: 0, fontSize: "1rem" }}>Интерактивная сводка</h4>
                <Link to={adminRoutes.distribution} className="birzha-ui-sm" style={{ fontWeight: 600 }}>
                  Погрузка
                </Link>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.65rem" }}>
                <button
                  type="button"
                  className={`birzha-btn birzha-btn--inline birzha-admin-summary-toggle${summaryChartMode === "mass" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryChartMode("mass")}
                >
                  Баланс массы
                </button>
                <button
                  type="button"
                  className={`birzha-btn birzha-btn--inline birzha-admin-summary-toggle${summaryChartMode === "warehouses" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryChartMode("warehouses")}
                >
                  По складам
                </button>
              </div>
              <SummaryTotalsStrip
                totals={aggregates.stockTotals}
                caption="Товар в обороте (склад + погружено + ожидание):"
              />
              {showMassChart ? (
                <div className="birzha-admin-dash-modern__mass-row">
                  <MassDistributionRing
                    warehouseKg={aggregates.warehouseKg}
                    loadingManifestKg={aggregates.loadingManifestKg}
                    inTripKg={aggregates.inTripRemainingKg}
                    soldKg={aggregates.soldKg}
                  />
                  <MassBalanceLegend segments={massSegments} />
                </div>
              ) : null}
              {showMassChart ? (
                <>
                  <h5 className="birzha-admin-dash-modern__subhead">По калибрам</h5>
                  <SummaryStockTable
                    labelColumn="Калибр"
                    rows={gradeRows}
                    totals={aggregates.stockTotals}
                    maxKg={summaryTableMaxKg}
                  />
                </>
              ) : null}
              {showWarehouseChart ? (
                <>
                  <h5 className="birzha-admin-dash-modern__subhead">По складам поступления</h5>
                  <SummaryStockTable
                    labelColumn="Склад"
                    rows={warehouseRows}
                    totals={aggregates.stockTotals}
                    maxKg={summaryTableMaxKg}
                    nestedGrades
                  />
                </>
              ) : null}
            </section>

            <aside className="birzha-admin-dash-modern__ops-card">
              <h4 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Операции сейчас</h4>
              <AdminSummaryAttention alerts={summaryAlerts} />
              <ul className="birzha-admin-dash-modern__ops-list">
                <li>
                  <span>Открытые рейсы</span>
                  <strong>{aggregates.tripsOpen}</strong>
                </li>
                <li>
                  <span>
                    Закрытые рейсы
                    <span className="birzha-admin-dash-modern__ops-hint">за период</span>
                  </span>
                  <strong>{aggregates.tripsClosed}</strong>
                </li>
                <li className="birzha-admin-dash-modern__ops-list-item--link">
                  <a href={`#${ADMIN_TRIPS_SECTION_ID}`} className="birzha-admin-dash-modern__ops-row">
                    <span>Готовы к закрытию</span>
                    <strong>{openTripsReadyToClose}</strong>
                  </a>
                </li>
                <li>
                  <span>Погрузочные в работе</span>
                  <strong>{aggregates.loadingManifestCount}</strong>
                </li>
                <li className="birzha-admin-dash-modern__ops-list-item--link">
                  <Link to={adminRoutes.distribution} className="birzha-admin-dash-modern__ops-row">
                    <span>
                      ПН без рейса
                      {aggregates.loadingManifestsWithoutTripKg > 0 ? (
                        <span className="birzha-admin-dash-modern__ops-hint">
                          {formatDashboardKg(aggregates.loadingManifestsWithoutTripKg)}
                        </span>
                      ) : null}
                    </span>
                    <strong>{aggregates.loadingManifestsWithoutTrip}</strong>
                  </Link>
                </li>
                {aggregates.batchCount > 0 ? (
                  <li>
                    <span>Активных партий</span>
                    <strong>{aggregates.batchCount}</strong>
                  </li>
                ) : null}
              </ul>
              <div className="birzha-admin-dash-modern__ops-links no-print">
                <Link to={adminRoutes.trips}>Рейсы</Link>
                <Link to={adminRoutes.reports}>Отчёты</Link>
                <Link to={adminRoutes.archive}>Архив</Link>
              </div>
              <p className="birzha-admin-dash-modern__ops-accounting birzha-ui-sm">
                <Link to={accounting.home}>Деньги и прибыль → Бухгалтерия</Link>
              </p>
            </aside>
          </div>

          <BirzhaDisclosure
            className="birzha-admin-dash-modern__trips-disclosure"
            title={`Готовые погрузочные (${activeManifestListRows.length})`}
            defaultOpen={false}
          >
            {activeManifestsQ.isError ? (
              <ErrorAlert
                error={activeManifestsQ.error}
                message="Не удалось загрузить погрузочные накладные."
                title="Погрузочные"
              />
            ) : null}
            {activeManifestsQ.isPending ? (
              <LoadingBlock label="Погрузочные накладные…" minHeight={48} skeleton skeletonRows={3} />
            ) : null}
            {activeManifestsQ.isSuccess && activeManifestListRows.length === 0 ? (
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
                Нет активных погрузочных.{" "}
                <Link to={adminRoutes.distribution}>Создать погрузку →</Link>
              </p>
            ) : null}
            {activeManifestsQ.isSuccess && activeManifestListRows.length > 0 ? (
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-admin-trips-table-wrap">
                <table className="birzha-admin-trips-table" aria-label="Готовые погрузочные накладные">
                  <thead>
                    <tr>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        ПН
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        Направление
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        Склад
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head birzha-admin-trips-table__head--right">
                        Кг
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        Дата
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeManifestListRows.map((row) => {
                      if (row.kind === "trip") {
                        const tripLabel = tripNumberById.get(row.tripId) ?? "—";
                        const href = `${adminRoutes.distribution}?${new URLSearchParams({ trip: row.tripId }).toString()}`;
                        return (
                          <tr key={row.key}>
                            <th scope="row" className="birzha-admin-trips-table__row-head">
                              <Link to={href} style={{ fontWeight: 700, textDecoration: "none" }}>
                                рейс {tripLabel}
                              </Link>
                            </th>
                            <td className="birzha-admin-trips-table__cell">{row.destinationName}</td>
                            <td className="birzha-admin-trips-table__cell birzha-text-muted">
                              {row.warehouseLabel}
                            </td>
                            <td className="birzha-admin-trips-table__cell birzha-admin-trips-table__cell--right">
                              {formatDashboardKg(row.totalKg)}
                            </td>
                            <td className="birzha-admin-trips-table__cell birzha-text-muted">
                              {formatPurchaseDocDateRu(row.docDate)}
                            </td>
                          </tr>
                        );
                      }
                      const m = row.manifest;
                      const href = `${adminRoutes.distribution}/${encodeURIComponent(m.id)}`;
                      return (
                        <tr key={row.key}>
                          <th scope="row" className="birzha-admin-trips-table__row-head">
                            <Link to={href} style={{ fontWeight: 700, textDecoration: "none" }}>
                              {m.manifestNumber}
                            </Link>
                          </th>
                          <td className="birzha-admin-trips-table__cell">{m.destinationName}</td>
                          <td className="birzha-admin-trips-table__cell birzha-text-muted">
                            {m.warehouseName}
                          </td>
                          <td className="birzha-admin-trips-table__cell birzha-admin-trips-table__cell--right">
                            {formatDashboardKg(m.totalKg)}
                          </td>
                          <td className="birzha-admin-trips-table__cell birzha-text-muted">
                            {formatPurchaseDocDateRu(m.docDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {(activeManifestsQ.data?.listMeta?.totalCount ?? 0) > 30 ? (
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                Показаны первые 30.{" "}
                <Link to={adminRoutes.distribution}>Все погрузочные →</Link>
              </p>
            ) : null}
          </BirzhaDisclosure>

          <BirzhaDisclosure
            id={ADMIN_TRIPS_SECTION_ID}
            className="birzha-admin-dash-modern__trips-disclosure"
            title={`Рейсы в работе (${sortedTripsOpen.length})`}
            defaultOpen
          >
            {tripsFailed ? (
              <ErrorAlert error={tripsQ.error} message="Не удалось загрузить список рейсов." title="Рейсы" />
            ) : null}
            <div className="birzha-admin-dash__trips">
              {sortedTripsOpen.length === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>—</p>
              ) : null}
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-admin-trips-table-wrap">
                <table className="birzha-admin-trips-table" aria-label="Рейсы в работе">
                  <thead>
                    <tr>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        №
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        Направление
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        Статус
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head">
                        ТС / водитель
                      </th>
                      <th scope="col" className="birzha-admin-trips-table__head birzha-admin-trips-table__head--right">
                        Отчёт
                      </th>
                      {showCloseTrip ? (
                        <th scope="col" className="birzha-admin-trips-table__head">
                          Закрытие
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tripsPageSlice.map((t) => {
                      const reportTo = tripReportHref(adminRoutes.reports, t.id);
                      const dest =
                        t.destinationName?.trim() ||
                        t.destinationCode?.trim() ||
                        "—";
                      const product = t.productGroup?.trim();
                      return (
                      <tr key={t.id}>
                        <th scope="row" className="birzha-admin-trips-table__row-head">
                          <Link
                            to={reportTo}
                            style={{ fontWeight: 700, textDecoration: "none" }}
                            onClick={(e) => {
                              e.preventDefault();
                              openTripReport(t.id);
                            }}
                          >
                            {t.tripNumber}
                          </Link>
                        </th>
                        <td className="birzha-admin-trips-table__cell">
                          {dest}
                          {product ? (
                            <span
                              className="birzha-text-muted birzha-ui-sm"
                              style={{ display: "block", marginTop: "0.15rem" }}
                            >
                              {product}
                            </span>
                          ) : null}
                        </td>
                        <td className="birzha-admin-trips-table__cell">
                          <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
                          {tripListFullySold(t) ? (
                            <span
                              className="birzha-text-muted birzha-ui-sm"
                              style={{ display: "block", marginTop: "0.2rem", fontWeight: 400 }}
                            >
                              {t.status === "closed" ? "всё продано" : "0 в машине"}
                            </span>
                          ) : null}
                        </td>
                        <td className="birzha-admin-trips-table__cell birzha-text-muted birzha-text-muted--lg">
                          {[t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="birzha-admin-trips-table__cell birzha-admin-trips-table__cell--right">
                          <Link
                            to={reportTo}
                            style={{ fontWeight: 600 }}
                            onClick={(e) => {
                              e.preventDefault();
                              openTripReport(t.id);
                            }}
                          >
                            Открыть
                          </Link>
                        </td>
                        {showCloseTrip ? (
                          <td className="birzha-admin-trips-table__cell">
                            {t.status === "open" ? (
                              <button
                                type="button"
                                className="birzha-btn birzha-btn--inline birzha-ui-sm"
                                disabled={closeTripMut.isPending}
                                onClick={() => closeTripMut.mutate(t.id)}
                              >
                                {closeTripMut.isPending ? "…" : "Закрыть рейс"}
                              </button>
                            ) : (
                              <span className="birzha-text-muted birzha-ui-sm">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              {closeTripMut.isError ? <ErrorAlert error={closeTripMut.error} title="Закрытие рейса" /> : null}
              {sortedTripsOpen.length > 0 ? (
                <BirzhaPagination
                  pageIndex={tripsPage}
                  pageCount={tripsPageCount}
                  itemLabel="рейсов"
                  onPageChange={setTripsPage}
                />
              ) : null}
            </div>
          </BirzhaDisclosure>
        </>
      )}
    </div>
  );
}
