import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import type { DashboardStockSlice } from "../api/types.js";
import {
  adminDashboardSummaryQueryOptions,
  queryRoots,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import {
  buildMassSegments,
  gradeTableRows,
  productGroupTableRows,
  warehouseTableRows,
} from "../format/admin-dashboard-summary-rows.js";
import { kopecksToRubLabel } from "../format/money.js";
import { formatTripListStatusLabel, tripListFullySold } from "../format/trip-label.js";
import { filterTripsInWork } from "../format/archive.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { adminRoutes } from "../routes.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyleInline, tableStyle, thHead, thtd } from "../ui/styles.js";

const ADMIN_TRIPS_PAGE_SIZE = 15;
type SummaryChartMode = "mass" | "warehouses" | "products";
type SummaryPeriod = "today" | "7d" | "30d" | "all";

function MassDistributionRing({
  warehouseKg,
  loadingManifestKg,
  inTripKg,
  soldKg,
}: {
  warehouseKg: number;
  loadingManifestKg: number;
  inTripKg: number;
  soldKg: number;
}) {
  const total = warehouseKg + loadingManifestKg + inTripKg + soldKg;
  if (total <= 0) {
    return (
      <div className="birzha-admin-mass-ring birzha-admin-mass-ring--empty" aria-hidden>
        <span className="birzha-admin-mass-ring__empty-label">Нет массы</span>
      </div>
    );
  }
  const w = (warehouseKg / total) * 360;
  const lm = w + (loadingManifestKg / total) * 360;
  const tr = lm + (inTripKg / total) * 360;
  const gradient = `conic-gradient(
    #16a34a 0deg ${w}deg,
    #7c3aed ${w}deg ${lm}deg,
    #f59e0b ${lm}deg ${tr}deg,
    #2563eb ${tr}deg 360deg
  )`;
  return (
    <div
      className="birzha-admin-mass-ring"
      style={{ background: gradient }}
      role="img"
      aria-label={`Распределение массы: на складе ${warehouseKg.toFixed(0)} кг, в погрузочных накладных ${loadingManifestKg.toFixed(0)} кг, в открытых рейсах ${inTripKg.toFixed(0)} кг, продано ${soldKg.toFixed(0)} кг`}
    >
      <div className="birzha-admin-mass-ring__hole" />
    </div>
  );
}

function formatKg(v: number): string {
  return `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} кг`;
}

function formatPackages(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

type MassSegment = {
  label: string;
  kg: number;
  fillClass: string;
};

function MassBalanceLegend({ segments }: { segments: MassSegment[] }) {
  const total = segments.reduce((sum, row) => sum + row.kg, 0);
  if (total <= 0) {
    return null;
  }
  return (
    <div className="birzha-admin-dash-modern__mass-bars" aria-label="Распределение массы по этапам">
      {segments.map((row) => (
        <div key={row.label} className="birzha-admin-dash-modern__bar-row">
          <div className="birzha-admin-dash-modern__bar-label">{row.label}</div>
          <div className="birzha-admin-dash-modern__bar-track">
            <div
              className={`birzha-admin-dash-modern__bar-fill ${row.fillClass}`}
              style={{ width: `${ratioPart(row.kg, total)}%` }}
            />
          </div>
          <div className="birzha-admin-dash-modern__bar-value">{formatKg(row.kg)}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryTotalsStrip({ totals, caption }: { totals: DashboardStockSlice; caption: string }) {
  if (totals.kg <= 0 && totals.packages <= 0) {
    return null;
  }
  return (
    <p className="birzha-admin-dash-modern__summary-totals birzha-ui-sm" style={{ margin: "0 0 0.65rem" }}>
      <span className="birzha-text-muted">{caption}</span>{" "}
      <strong>{formatKg(totals.kg)}</strong>
      <span className="birzha-text-muted"> · </span>
      <strong>{formatPackages(totals.packages)} ящ.</strong>
      <span className="birzha-text-muted"> · </span>
      <strong>{kopecksToRubLabel(totals.valueKopecks)} ₽</strong>
      <span className="birzha-text-muted"> (оценка по закупу)</span>
    </p>
  );
}

type SummaryTableProps = {
  labelColumn: string;
  rows: Array<{
    key: string;
    label: string;
    sublabel?: string | null;
    kg: number;
    packages: number;
    valueKopecks: string;
  }>;
  totals?: DashboardStockSlice;
  maxKg: number;
};

function SummaryStockTable({ labelColumn, rows, totals, maxKg }: SummaryTableProps) {
  if (rows.length === 0) {
    return <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>—</p>;
  }
  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
      <table style={{ ...tableStyle, minWidth: 420 }} className="birzha-admin-summary-table">
        <thead>
          <tr>
            <th scope="col" style={thHead}>
              {labelColumn}
            </th>
            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
              Кг
            </th>
            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
              Ящ.
            </th>
            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
              Сумма, ₽
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" style={thtd}>
                <div className="birzha-admin-summary-table__label">{row.label}</div>
                {row.sublabel ? (
                  <div className="birzha-text-muted birzha-ui-sm birzha-admin-summary-table__sublabel">
                    {row.sublabel}
                  </div>
                ) : null}
                <div className="birzha-admin-dash-modern__warehouse-track birzha-admin-summary-table__track">
                  <div
                    className="birzha-admin-dash-modern__warehouse-fill"
                    style={{ width: `${ratioPart(row.kg, maxKg)}%` }}
                  />
                </div>
              </th>
              <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>{formatKg(row.kg)}</td>
              <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>{formatPackages(row.packages)}</td>
              <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                {kopecksToRubLabel(row.valueKopecks)}
              </td>
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot>
            <tr className="birzha-admin-summary-table__foot">
              <th scope="row" style={{ ...thtd, fontWeight: 700 }}>
                Итого
              </th>
              <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{formatKg(totals.kg)}</td>
              <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{formatPackages(totals.packages)}</td>
              <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{kopecksToRubLabel(totals.valueKopecks)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function ratioPart(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function periodStartDate(period: SummaryPeriod): Date | null {
  if (period === "all") {
    return null;
  }
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const d = new Date(now);
  d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
  return d;
}

/**
 * Дашборд администратора: KPI, распределение массы, топ складов/видов товара, рейсы.
 */
export function AdminCabinetHome() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canCreateTrip(user ?? null);
  const [summaryChartMode, setSummaryChartMode] = useState<SummaryChartMode>("mass");
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>("30d");

  const periodStart = useMemo(() => periodStartDate(summaryPeriod), [summaryPeriod]);
  const sinceParam = periodStart ? periodStart.toISOString().slice(0, 10) : undefined;

  const summaryQ = useQuery({
    ...adminDashboardSummaryQueryOptions(sinceParam),
    refetchOnMount: "always",
  });
  const tripsQ = useQuery(tripsPickerQueryOptions({ limit: 500, status: "open" }));

  const aggregates = useMemo(() => {
    const summary = summaryQ.data;
    if (!summary) {
      return {
        tripCount: 0,
        tripsOpen: 0,
        tripsClosed: 0,
        batchCount: 0,
        warehouseKg: 0,
        transitKg: 0,
        soldKg: 0,
        dispatchedKg: 0,
        inTripRemainingKg: 0,
        loadingManifestKg: 0,
        loadingManifestCount: 0,
        loadingManifestsWithoutTrip: 0,
        byWarehouseKg: new Map<string, number>(),
        byProductGroupKg: new Map<string, number>(),
        stockTotals: { kg: 0, packages: 0, valueKopecks: "0" },
        byGrade: [],
        byWarehouse: [],
        byProductGroup: [],
      };
    }
    const byWarehouseKg = new Map<string, number>();
    for (const [k, v] of Object.entries(summary.warehouse.byWarehouseKg)) {
      byWarehouseKg.set(k, v);
    }
    const byProductGroupKg = new Map<string, number>();
    for (const [k, v] of Object.entries(summary.warehouse.byProductGroupKg)) {
      byProductGroupKg.set(k, v);
    }
    return {
      tripCount: summary.trips.openCount + summary.trips.closedCount,
      tripsOpen: summary.trips.openCount,
      tripsClosed: summary.trips.closedCount,
      batchCount: summary.warehouse.batchCount,
      warehouseKg: summary.warehouse.warehouseKg,
      transitKg: summary.trips.shippedKg,
      soldKg: summary.trips.soldKg,
      dispatchedKg: summary.trips.remainingInTripKg,
      inTripRemainingKg: summary.trips.remainingInTripKg,
      loadingManifestKg: summary.loadingManifests.activeKg,
      loadingManifestCount: summary.loadingManifests.activeCount,
      loadingManifestsWithoutTrip: summary.loadingManifests.withoutTripCount,
      byWarehouseKg,
      byProductGroupKg,
      stockTotals: summary.warehouse.stockTotals,
      byGrade: summary.warehouse.byGrade,
      byWarehouse: summary.warehouse.byWarehouse,
      byProductGroup: summary.warehouse.byProductGroup,
    };
  }, [summaryQ.data]);

  const sortedTripsOpen = useMemo(
    () => sortTripsByDepartedDesc(filterTripsInWork(tripsQ.data?.trips ?? [])),
    [tripsQ.data?.trips],
  );

  const [tripsPage, setTripsPage] = useState(0);
  const tripsPageCount = Math.max(1, Math.ceil(sortedTripsOpen.length / ADMIN_TRIPS_PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedTripsOpen.length / ADMIN_TRIPS_PAGE_SIZE) - 1);
    setTripsPage((p) => Math.min(p, maxPage));
  }, [sortedTripsOpen.length]);

  const tripsPageSlice = useMemo(() => {
    const start = tripsPage * ADMIN_TRIPS_PAGE_SIZE;
    return sortedTripsOpen.slice(start, start + ADMIN_TRIPS_PAGE_SIZE);
  }, [sortedTripsOpen, tripsPage]);

  const gradeRows = useMemo(() => gradeTableRows(aggregates.byGrade), [aggregates.byGrade]);
  const warehouseRows = useMemo(() => warehouseTableRows(aggregates.byWarehouse), [aggregates.byWarehouse]);
  const productGroupRows = useMemo(
    () => productGroupTableRows(aggregates.byProductGroup),
    [aggregates.byProductGroup],
  );
  const summaryTableMaxKg = useMemo(() => {
    const rows =
      summaryChartMode === "mass"
        ? gradeRows
        : summaryChartMode === "warehouses"
          ? warehouseRows
          : productGroupRows;
    return rows[0]?.kg ?? 0;
  }, [gradeRows, productGroupRows, summaryChartMode, warehouseRows]);

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
  const showProductChart = summaryChartMode === "products";
  const openTripsReadyToClose = useMemo(
    () => sortedTripsOpen.filter((t) => t.status === "open" && tripListFullySold(t)).length,
    [sortedTripsOpen],
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
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryPeriod === "today" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryPeriod("today")}
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryPeriod === "7d" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryPeriod("7d")}
                >
                  7 дней
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryPeriod === "30d" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryPeriod("30d")}
                >
                  30 дней
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryPeriod === "all" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryPeriod("all")}
                >
                  Всё время
                </button>
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

          <section className="birzha-kpi-grid birzha-kpi-grid--wide birzha-admin-dash-modern__kpi">
              <Link
                to={adminRoutes.stockWarehouses}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent birzha-kpi-tile--link"
                title="Остаток на складах"
              >
                <div className="birzha-kpi-tile__label">Остаток на складе</div>
                <div className="birzha-kpi-tile__value">{formatKg(aggregates.warehouseKg)}</div>
              </Link>
              <Link
                to={adminRoutes.distribution}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Погрузочные накладные в работе"
              >
                <div className="birzha-kpi-tile__label">В погрузочных</div>
                <div className="birzha-kpi-tile__value">{formatKg(aggregates.loadingManifestKg)}</div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber birzha-kpi-tile--link"
                title="Остаток в открытых рейсах (ещё не продано)"
              >
                <div className="birzha-kpi-tile__label">В открытых рейсах</div>
                <div className="birzha-kpi-tile__value">{formatKg(aggregates.dispatchedKg)}</div>
              </Link>
              <Link
                to={adminRoutes.assignSeller}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue birzha-kpi-tile--link"
                title="Продано с открытых рейсов"
              >
                <div className="birzha-kpi-tile__label">Продано</div>
                <div className="birzha-kpi-tile__value">{formatKg(aggregates.soldKg)}</div>
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
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryChartMode === "mass" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryChartMode("mass")}
                >
                  Баланс массы
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryChartMode === "warehouses" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryChartMode("warehouses")}
                >
                  По складам
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryChartMode === "products" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => setSummaryChartMode("products")}
                >
                  По видам товара
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
                  />
                </>
              ) : null}
              {showProductChart ? (
                <>
                  <h5 className="birzha-admin-dash-modern__subhead">По видам товара</h5>
                  <SummaryStockTable
                    labelColumn="Вид"
                    rows={productGroupRows}
                    totals={aggregates.stockTotals}
                    maxKg={summaryTableMaxKg}
                  />
                </>
              ) : null}
            </section>

            <aside className="birzha-admin-dash-modern__ops-card">
              <h4 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Операции сейчас</h4>
              <ul className="birzha-admin-dash-modern__ops-list">
                <li>
                  <span>Открытые рейсы</span>
                  <strong>{aggregates.tripsOpen}</strong>
                </li>
                <li>
                  <span>Закрытые рейсы</span>
                  <strong>{aggregates.tripsClosed}</strong>
                </li>
                <li>
                  <span>Готовы к закрытию</span>
                  <strong>{openTripsReadyToClose}</strong>
                </li>
                <li>
                  <span>Погрузочные в работе</span>
                  <strong>{aggregates.loadingManifestCount}</strong>
                </li>
                <li>
                  <span>ПН без рейса</span>
                  <strong>{aggregates.loadingManifestsWithoutTrip}</strong>
                </li>
              </ul>
              <div className="birzha-admin-dash-modern__ops-links no-print">
                <Link to={adminRoutes.trips}>Рейсы</Link>
                <Link to={adminRoutes.reports}>Отчёты</Link>
                <Link to={adminRoutes.archive}>Архив</Link>
              </div>
            </aside>
          </div>

          <BirzhaDisclosure title={`Рейсы в работе (${sortedTripsOpen.length})`} defaultOpen>
            {tripsFailed ? (
              <ErrorAlert error={tripsQ.error} message="Не удалось загрузить список рейсов." title="Рейсы" />
            ) : null}
            <div className="birzha-admin-dash__trips">
              {sortedTripsOpen.length === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>—</p>
              ) : null}
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table className="birzha-admin-trips-table" style={tableStyle} aria-label="Рейсы в работе">
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        №
                      </th>
                      <th scope="col" style={thHead}>
                        Статус
                      </th>
                      <th scope="col" style={thHead}>
                        ТС / водитель
                      </th>
                      <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                        Отчёт
                      </th>
                      {showCloseTrip ? (
                        <th scope="col" style={thHead}>
                          Закрытие
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tripsPageSlice.map((t) => {
                      const reportTo = `${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`;
                      return (
                      <tr key={t.id}>
                        <th scope="row" style={thtd}>
                          <Link to={reportTo} style={{ fontWeight: 700, textDecoration: "none" }}>
                            {t.tripNumber}
                          </Link>
                        </th>
                        <td style={thtd}>
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
                        <td className="birzha-text-muted birzha-text-muted--lg" style={thtd}>
                          {[t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          <Link to={reportTo} style={{ fontWeight: 600 }}>
                            Открыть
                          </Link>
                        </td>
                        {showCloseTrip ? (
                          <td style={thtd}>
                            {t.status === "open" ? (
                              <button
                                type="button"
                                className="birzha-ui-sm"
                                style={btnStyleInline}
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
