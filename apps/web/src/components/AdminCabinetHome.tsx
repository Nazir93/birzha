import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import {
  adminDashboardSummaryQueryOptions,
  queryRoots,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
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
  const [hoveredChartLabel, setHoveredChartLabel] = useState<string | null>(null);

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

  const topWarehouses = useMemo(
    () =>
      [...aggregates.byWarehouseKg.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, kg]) => ({ name, kg })),
    [aggregates.byWarehouseKg],
  );
  const topProductGroups = useMemo(
    () =>
      [...aggregates.byProductGroupKg.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, kg]) => ({ name, kg })),
    [aggregates.byProductGroupKg],
  );

  const topWarehouseKgMax = topWarehouses[0]?.kg ?? 0;
  const topProductGroupKgMax = topProductGroups[0]?.kg ?? 0;
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
                  onClick={() => {
                    setSummaryChartMode("mass");
                    setHoveredChartLabel(null);
                  }}
                >
                  Баланс массы
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryChartMode === "warehouses" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => {
                    setSummaryChartMode("warehouses");
                    setHoveredChartLabel(null);
                  }}
                >
                  По складам
                </button>
                <button
                  type="button"
                  style={btnStyleInline}
                  className={`birzha-admin-summary-toggle${summaryChartMode === "products" ? " birzha-admin-summary-toggle--active" : ""}`}
                  onClick={() => {
                    setSummaryChartMode("products");
                    setHoveredChartLabel(null);
                  }}
                >
                  По видам товара
                </button>
              </div>
              {showMassChart ? (
                <div className="birzha-admin-dash-modern__mass-row">
                  <div onMouseEnter={() => setHoveredChartLabel("Распределение массы")}>
                    <MassDistributionRing
                      warehouseKg={aggregates.warehouseKg}
                      loadingManifestKg={aggregates.loadingManifestKg}
                      inTripKg={aggregates.inTripRemainingKg}
                      soldKg={aggregates.soldKg}
                    />
                  </div>
                </div>
              ) : null}

              {(showWarehouseChart || showProductChart) && (showWarehouseChart ? topWarehouses.length : topProductGroups.length) === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>—</p>
              ) : null}
              {(showWarehouseChart || showProductChart) && (showWarehouseChart ? topWarehouses.length : topProductGroups.length) > 0 ? (
                <div
                  className="birzha-admin-dash-modern__warehouse-bars"
                  aria-label={showWarehouseChart ? "Топ складов по остатку" : "Виды товара по массе"}
                >
                  {(showWarehouseChart ? topWarehouses : topProductGroups).map((row) => (
                    <div
                      key={row.name}
                      className="birzha-admin-dash-modern__warehouse-row"
                      onMouseEnter={() => setHoveredChartLabel(row.name)}
                    >
                      <div className="birzha-admin-dash-modern__warehouse-name">{row.name}</div>
                      <div className="birzha-admin-dash-modern__warehouse-track">
                        <div
                          className="birzha-admin-dash-modern__warehouse-fill"
                          style={{
                            width: `${ratioPart(
                              row.kg,
                              showWarehouseChart ? topWarehouseKgMax : topProductGroupKgMax,
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="birzha-admin-dash-modern__warehouse-value">{formatKg(row.kg)}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {hoveredChartLabel ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.6rem 0 0" }}>
                  Наведение: <strong>{hoveredChartLabel}</strong>
                </p>
              ) : (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.6rem 0 0" }}>
                  Наведите на сегмент или строку графика.
                </p>
              )}
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
