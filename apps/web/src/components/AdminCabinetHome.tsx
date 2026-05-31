import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import {
  batchesFullListQueryOptions,
  loadingManifestsListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import { formatTripListStatusLabel, tripListFullySold } from "../format/trip-label.js";
import { closedTripIdSet, filterTripsInWork, splitLoadingManifestsByArchive } from "../format/archive.js";
import { sumOpenTripsMassKg, sumWarehouseKgFromBatches } from "../format/admin-dashboard-aggregates.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { adminRoutes } from "../routes.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyleInline, tableStyle, thHead, thtd } from "../ui/styles.js";

const ADMIN_TRIPS_PAGE_SIZE = 15;

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

/**
 * Дашборд администратора: KPI, распределение массы, топ складов/видов товара, рейсы.
 */
export function AdminCabinetHome() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canCreateTrip(user ?? null);

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const loadingManifestsQ = useQuery(loadingManifestsListQueryOptions());
  const batchesQ = useQuery({
    ...batchesFullListQueryOptions(),
    /** Сводка должна видеть свежие остатки после накладной на другой вкладке / из кэша localStorage. */
    refetchOnMount: "always",
  });
  const whQ = useQuery(warehousesFullListQueryOptions());

  const whById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of whQ.data?.warehouses ?? []) {
      m.set(w.id, w.name || w.code);
    }
    return m;
  }, [whQ.data?.warehouses]);

  const aggregates = useMemo(() => {
    const batches = batchesQ.data?.batches ?? [];
    const trips = tripsQ.data?.trips ?? [];
    const warehouseSums = sumWarehouseKgFromBatches(batches, whById);
    const openTripsMass = sumOpenTripsMassKg(trips);

    let tripsOpen = 0;
    let tripsClosed = 0;
    for (const t of trips) {
      if (t.status === "closed") {
        tripsClosed += 1;
      } else {
        tripsOpen += 1;
      }
    }

    const closedTripIds = closedTripIdSet(trips);
    const activeLoadingManifests = splitLoadingManifestsByArchive(
      loadingManifestsQ.data?.loadingManifests ?? [],
      closedTripIds,
    ).active;
    const loadingManifestKg = activeLoadingManifests.reduce((s, m) => s + m.totalKg, 0);

    /** Открытые рейсы: отгрузка / остаток в машине / продажи — из журналов рейса, не из полей партии. */
    const transitKg = openTripsMass.shippedKg;
    const dispatchedKg = openTripsMass.remainingInTripKg;
    const soldKg = openTripsMass.soldKg;

    return {
      tripCount: trips.length,
      tripsOpen,
      tripsClosed,
      batchCount: warehouseSums.batchCount,
      warehouseKg: warehouseSums.warehouseKg,
      transitKg,
      soldKg,
      dispatchedKg,
      inTripRemainingKg: dispatchedKg,
      loadingManifestKg,
      loadingManifestCount: activeLoadingManifests.length,
      byWarehouseKg: warehouseSums.byWarehouseKg,
    };
  }, [batchesQ.data?.batches, loadingManifestsQ.data?.loadingManifests, tripsQ.data?.trips, whQ.data?.warehouses.length, whById]);

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

  const topWarehouseKgMax = topWarehouses[0]?.kg ?? 0;
  const totalVisibleMass =
    aggregates.warehouseKg + aggregates.loadingManifestKg + aggregates.inTripRemainingKg + aggregates.soldKg;

  const loading = tripsQ.isPending || batchesQ.isPending || whQ.isPending;
  const err = tripsQ.isError || batchesQ.isError || whQ.isError;

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
      {err ? <ErrorAlert message="Ошибка загрузки данных." title="Сводка" /> : null}
      {!loading && !err && (
        <>
          <header className="birzha-admin-dash-modern__hero">
            <div>
              <p className="birzha-home-hero__eyebrow">Панель управления</p>
              <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
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
                <h4 style={{ margin: 0, fontSize: "1rem" }}>Распределение массы</h4>
                <Link to={adminRoutes.distribution} className="birzha-ui-sm" style={{ fontWeight: 600 }}>
                  Погрузка
                </Link>
              </div>
              <div className="birzha-admin-dash-modern__mass-row">
                <MassDistributionRing
                  warehouseKg={aggregates.warehouseKg}
                  loadingManifestKg={aggregates.loadingManifestKg}
                  inTripKg={aggregates.inTripRemainingKg}
                  soldKg={aggregates.soldKg}
                />
                <div className="birzha-admin-dash-modern__mass-bars">
                  <div className="birzha-admin-dash-modern__bar-row">
                    <div className="birzha-admin-dash-modern__bar-label">На складе</div>
                    <div className="birzha-admin-dash-modern__bar-track">
                      <div
                        className="birzha-admin-dash-modern__bar-fill birzha-admin-dash-modern__bar-fill--wh"
                        style={{ width: `${ratioPart(aggregates.warehouseKg, totalVisibleMass)}%` }}
                      />
                    </div>
                    <div className="birzha-admin-dash-modern__bar-value">{formatKg(aggregates.warehouseKg)}</div>
                  </div>
                  <div className="birzha-admin-dash-modern__bar-row">
                    <div className="birzha-admin-dash-modern__bar-label">В ПН</div>
                    <div className="birzha-admin-dash-modern__bar-track">
                      <div
                        className="birzha-admin-dash-modern__bar-fill birzha-admin-dash-modern__bar-fill--lm"
                        style={{ width: `${ratioPart(aggregates.loadingManifestKg, totalVisibleMass)}%` }}
                      />
                    </div>
                    <div className="birzha-admin-dash-modern__bar-value">{formatKg(aggregates.loadingManifestKg)}</div>
                  </div>
                  <div className="birzha-admin-dash-modern__bar-row">
                    <div className="birzha-admin-dash-modern__bar-label">В рейсе</div>
                    <div className="birzha-admin-dash-modern__bar-track">
                      <div
                        className="birzha-admin-dash-modern__bar-fill birzha-admin-dash-modern__bar-fill--tr"
                        style={{ width: `${ratioPart(aggregates.inTripRemainingKg, totalVisibleMass)}%` }}
                      />
                    </div>
                    <div className="birzha-admin-dash-modern__bar-value">{formatKg(aggregates.inTripRemainingKg)}</div>
                  </div>
                  <div className="birzha-admin-dash-modern__bar-row">
                    <div className="birzha-admin-dash-modern__bar-label">Продано</div>
                    <div className="birzha-admin-dash-modern__bar-track">
                      <div
                        className="birzha-admin-dash-modern__bar-fill birzha-admin-dash-modern__bar-fill--sl"
                        style={{ width: `${ratioPart(aggregates.soldKg, totalVisibleMass)}%` }}
                      />
                    </div>
                    <div className="birzha-admin-dash-modern__bar-value">{formatKg(aggregates.soldKg)}</div>
                  </div>
                </div>
              </div>

              <h5 className="birzha-admin-dash-modern__subhead">Топ складов по остатку</h5>
              {topWarehouses.length === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>—</p>
              ) : (
                <div className="birzha-admin-dash-modern__warehouse-bars" aria-label="Топ складов по остатку">
                  {topWarehouses.map((row) => (
                    <div key={row.name} className="birzha-admin-dash-modern__warehouse-row">
                      <div className="birzha-admin-dash-modern__warehouse-name">{row.name}</div>
                      <div className="birzha-admin-dash-modern__warehouse-track">
                        <div
                          className="birzha-admin-dash-modern__warehouse-fill"
                          style={{ width: `${ratioPart(row.kg, topWarehouseKgMax)}%` }}
                        />
                      </div>
                      <div className="birzha-admin-dash-modern__warehouse-value">{formatKg(row.kg)}</div>
                    </div>
                  ))}
                </div>
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
                  <span>Погрузочные в работе</span>
                  <strong>{aggregates.loadingManifestCount}</strong>
                </li>
                <li>
                  <span>Остаток на складе</span>
                  <strong>{formatKg(aggregates.warehouseKg)}</strong>
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
