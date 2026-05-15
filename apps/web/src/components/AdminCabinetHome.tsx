import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import {
  batchesFullListQueryOptions,
  counterpartiesFullListQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { formatTripListStatusLabel, tripListShowsSoldOut } from "../format/trip-label.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { HorizontalBarChart, type HorizontalBarItem } from "../ui/charts/HorizontalBarChart.js";
import { MassBalanceStrip } from "../ui/charts/MassBalanceStrip.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyleInline, errorText, tableStyle, thHead, thtd } from "../ui/styles.js";

const ADMIN_TRIPS_PAGE_SIZE = 15;

const TRIP_WRITE_ROLES = ["admin", "manager", "logistics"] as const;

function canTripWrite(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null): boolean {
  if (!user) {
    return false;
  }
  return TRIP_WRITE_ROLES.some((r) =>
    user.roles.some((g) => g.roleCode === r && g.scopeType === "global" && g.scopeId === ""),
  );
}

function MassDistributionRing({
  warehouseKg,
  transitKg,
  soldKg,
}: {
  warehouseKg: number;
  transitKg: number;
  soldKg: number;
}) {
  const total = warehouseKg + transitKg + soldKg;
  if (total <= 0) {
    return (
      <div className="birzha-admin-mass-ring birzha-admin-mass-ring--empty" aria-hidden>
        <span className="birzha-admin-mass-ring__empty-label">Нет массы</span>
      </div>
    );
  }
  const w = (warehouseKg / total) * 360;
  const tr = (transitKg / total) * 360;
  const w2 = w + tr;
  const gradient = `conic-gradient(
    #16a34a 0deg ${w}deg,
    #f59e0b ${w}deg ${w2}deg,
    #2563eb ${w2}deg 360deg
  )`;
  return (
    <div
      className="birzha-admin-mass-ring"
      style={{ background: gradient }}
      role="img"
      aria-label={`Распределение массы: на складе ${warehouseKg.toFixed(0)} кг, погружено ${transitKg.toFixed(0)} кг, продано ${soldKg.toFixed(0)} кг`}
    >
      <div className="birzha-admin-mass-ring__hole" />
    </div>
  );
}

/**
 * Дашборд администратора: KPI, распределение массы, топ складов/видов товара, рейсы.
 */
export function AdminCabinetHome() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canTripWrite(user ?? null);

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const batchesQ = useQuery(batchesFullListQueryOptions());
  const whQ = useQuery(warehousesFullListQueryOptions());
  const gradesQ = useQuery(productGradesFullListQueryOptions());

  const purchaseDocsQ = useQuery({
    ...purchaseDocumentsFullListQueryOptions(),
    enabled: meta?.purchaseDocumentsApi === "enabled",
  });

  const counterpartiesQ = useQuery({
    ...counterpartiesFullListQueryOptions(),
    enabled: meta?.counterpartyCatalogApi === "enabled",
  });

  const whById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of whQ.data?.warehouses ?? []) {
      m.set(w.id, w.name || w.code);
    }
    return m;
  }, [whQ.data?.warehouses]);

  const aggregates = useMemo(() => {
    const batches = batchesQ.data?.batches ?? [];
    let warehouseKg = 0;
    let transitKg = 0;
    let soldKg = 0;
    let writtenOffKg = 0;
    const byWarehouseKg = new Map<string, number>();
    const byProductGroupKg = new Map<string, number>();

    for (const b of batches) {
      if (b.onWarehouseKg > 0) {
        warehouseKg += b.onWarehouseKg;
      }
      if (b.inTransitKg > 0) {
        transitKg += b.inTransitKg;
      }
      if (b.soldKg > 0) {
        soldKg += b.soldKg;
      }
      writtenOffKg += b.writtenOffKg ?? 0;

      const wid = b.nakladnaya?.warehouseId ?? "";
      const whLabel = wid ? whById.get(wid) ?? wid.slice(0, 8) : "Без склада";
      byWarehouseKg.set(whLabel, (byWarehouseKg.get(whLabel) ?? 0) + b.onWarehouseKg);

      const g = (b.nakladnaya?.productGroup ?? "").trim() || "Без вида";
      byProductGroupKg.set(g, (byProductGroupKg.get(g) ?? 0) + b.totalKg);
    }

    const trips = tripsQ.data?.trips ?? [];
    let tripsOpen = 0;
    let tripsClosed = 0;
    for (const t of trips) {
      if (t.status === "closed") {
        tripsClosed += 1;
      } else {
        tripsOpen += 1;
      }
    }

    const warehouseBars: HorizontalBarItem[] = [...byWarehouseKg.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({
        label,
        value,
        display: `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`,
      }));

    const groupBars: HorizontalBarItem[] = [...byProductGroupKg.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, value]) => ({
        label,
        value,
        display: `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`,
      }));

    /** Отгружено со склада = погружено в рейс (inTransit) + уже продано по партиям. */
    const dispatchedKg = transitKg + soldKg;

    return {
      tripCount: trips.length,
      tripsOpen,
      tripsClosed,
      batchCount: batches.length,
      warehouseKg,
      transitKg,
      soldKg,
      dispatchedKg,
      writtenOffKg,
      warehouseCatalogCount: whQ.data?.warehouses.length ?? 0,
      warehouseBars,
      groupBars,
    };
  }, [batchesQ.data?.batches, tripsQ.data?.trips, whQ.data?.warehouses.length, whById]);

  const sortedTripsAll = useMemo(() => {
    const list = [...(tripsQ.data?.trips ?? [])];
    list.sort((a, b) => {
      const da = a.departedAt ? Date.parse(a.departedAt) : 0;
      const db = b.departedAt ? Date.parse(b.departedAt) : 0;
      if (db !== da) {
        return db - da;
      }
      return b.tripNumber.localeCompare(a.tripNumber, "ru");
    });
    return list;
  }, [tripsQ.data?.trips]);

  const [tripsPage, setTripsPage] = useState(0);
  const tripsPageCount = Math.max(1, Math.ceil(sortedTripsAll.length / ADMIN_TRIPS_PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedTripsAll.length / ADMIN_TRIPS_PAGE_SIZE) - 1);
    setTripsPage((p) => Math.min(p, maxPage));
  }, [sortedTripsAll.length]);

  const tripsPageSlice = useMemo(() => {
    const start = tripsPage * ADMIN_TRIPS_PAGE_SIZE;
    return sortedTripsAll.slice(start, start + ADMIN_TRIPS_PAGE_SIZE);
  }, [sortedTripsAll, tripsPage]);

  const loading = tripsQ.isPending || batchesQ.isPending || whQ.isPending;
  const err = tripsQ.isError || batchesQ.isError || whQ.isError;

  const closeTripMut = useMutation({
    mutationFn: async (tripId: string) => {
      const t = (tripsQ.data?.trips ?? []).find((x) => x.id === tripId);
      if (!t) {
        throw new Error("Рейс не найден в списке");
      }
      if (!tripListShowsSoldOut(t)) {
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

  const pdErr = purchaseDocsQ.isError && meta?.purchaseDocumentsApi === "enabled";
  const cpErr = counterpartiesQ.isError && meta?.counterpartyCatalogApi === "enabled";

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка</h2>

      {loading && <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={5} />}
      {err && (
        <p role="alert" style={errorText}>
          Ошибка загрузки данных.
        </p>
      )}
      {!loading && !err && (
        <>
          <header className="birzha-admin-dash__hero">
            <Link
              to={adminRoutes.distribution}
              className="birzha-admin-dash__hero-ring birzha-admin-dash__hero-ring--link"
              title="Распределение массы и партии по складам"
            >
              <MassDistributionRing
                warehouseKg={aggregates.warehouseKg}
                transitKg={aggregates.transitKg}
                soldKg={aggregates.soldKg}
              />
              <ul className="birzha-admin-dash__legend" aria-hidden>
                <li>
                  <span className="birzha-admin-dash__legend-dot birzha-admin-dash__legend-dot--wh" /> На складе
                </li>
                <li>
                  <span className="birzha-admin-dash__legend-dot birzha-admin-dash__legend-dot--tr" /> Погружено
                </li>
                <li>
                  <span className="birzha-admin-dash__legend-dot birzha-admin-dash__legend-dot--sl" /> Продано
                </li>
              </ul>
            </Link>
            <div className="birzha-admin-dash__hero-stats">
              <Link
                to={adminRoutes.stockWarehouses}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--link"
                title="Склады и остатки по складам"
              >
                <span className="birzha-admin-stat__label">На складах</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
              <Link
                to={adminRoutes.transitTrips}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--amber birzha-admin-stat--link"
                title="Рейсы с погруженным остатком (в машине)"
              >
                <span className="birzha-admin-stat__label">Погружено</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
              <Link
                to={adminRoutes.soldBySeller}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--blue birzha-admin-stat--link"
                title="Продажи по продавцам"
              >
                <span className="birzha-admin-stat__label">Продано (партии)</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
              <Link
                to={adminRoutes.sellerDispatch}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--link"
                title="Отгружено со склада: погружено + продано (партии)"
              >
                <span className="birzha-admin-stat__label">Отгружено</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.dispatchedKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
            </div>
          </header>

          <nav className="birzha-admin-dash__quick-nav no-print" aria-label="Погрузка и отгрузка">
            <Link to={adminRoutes.loadingManifests}>Погрузка на машину</Link>
            <span className="birzha-admin-dash__quick-nav-sep" aria-hidden="true">
              ·
            </span>
            <Link to={adminRoutes.sellerDispatch}>Отгрузка в рейс</Link>
            <span className="birzha-admin-dash__quick-nav-sep" aria-hidden="true">
              ·
            </span>
            <Link to={adminRoutes.transitTrips}>Рейсы с остатком</Link>
          </nav>

          <div className="birzha-dashboard-layout birzha-admin-dash__body">
            <BirzhaDisclosure title="Сводные показатели" defaultOpen>
            <div className="birzha-kpi-grid birzha-kpi-grid--wide birzha-admin-dash__kpi">
              <Link
                to={adminRoutes.tripRegistry}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Реестр рейсов: поиск и погрузочные накладные"
              >
                <div className="birzha-kpi-tile__label">Рейсов</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripCount}</div>
              </Link>
              <Link
                to={`${adminRoutes.tripRegistry}?status=open`}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Открытые рейсы"
              >
                <div className="birzha-kpi-tile__label">Открытых</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripsOpen}</div>
              </Link>
              <Link
                to={`${adminRoutes.tripRegistry}?status=closed`}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Закрытые рейсы"
              >
                <div className="birzha-kpi-tile__label">Закрытых</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripsClosed}</div>
              </Link>
              <Link
                to={`${adminRoutes.inventory}#inv-product-grades`}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Справочник калибров"
              >
                <div className="birzha-kpi-tile__label">Партий</div>
                <div className="birzha-kpi-tile__value">{aggregates.batchCount}</div>
              </Link>
              <Link
                to={adminRoutes.stockWarehouses}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent birzha-kpi-tile--link"
                title="Склады и остатки"
              >
                <div className="birzha-kpi-tile__label">На складах, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.transitTrips}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber birzha-kpi-tile--link"
                title="Погружено в рейс: остаток в машине (до продажи)"
              >
                <div className="birzha-kpi-tile__label">Погружено, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.sellerDispatch}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Отгружено со склада: погружено + продано"
              >
                <div className="birzha-kpi-tile__label">Отгружено, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.dispatchedKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.soldBySeller}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue birzha-kpi-tile--link"
                title="Продано по продавцам"
              >
                <div className="birzha-kpi-tile__label">Продано, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={
                  meta?.warehouseWriteOffApi === "enabled"
                    ? adminRoutes.warehouseWriteOffsLedger
                    : adminRoutes.distribution
                }
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title={
                  meta?.warehouseWriteOffApi === "enabled"
                    ? "Журнал списаний брака с остатка на складе"
                    : "Распределение — списание с остатка при PostgreSQL"
                }
              >
                <div className="birzha-kpi-tile__label">Списано, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.writtenOffKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.inventory}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Справочник складов"
              >
                <div className="birzha-kpi-tile__label">Складов</div>
                <div className="birzha-kpi-tile__value">{aggregates.warehouseCatalogCount}</div>
              </Link>
              <Link
                to={adminRoutes.inventory}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Справочник калибров"
              >
                <div className="birzha-kpi-tile__label">Калибров</div>
                <div className="birzha-kpi-tile__value">
                  {gradesQ.isPending ? "…" : gradesQ.data?.productGrades.length ?? "—"}
                </div>
              </Link>
              {meta?.purchaseDocumentsApi === "enabled" ? (
                <Link
                  to={adminRoutes.purchaseNakladnaya}
                  className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                  title="Список накладных закупки"
                >
                  <div className="birzha-kpi-tile__label">Накладных</div>
                  <div className="birzha-kpi-tile__value">
                    {purchaseDocsQ.isPending ? "…" : purchaseDocsQ.data?.purchaseDocuments.length ?? "—"}
                  </div>
                </Link>
              ) : null}
              {meta?.counterpartyCatalogApi === "enabled" ? (
                <Link
                  to={accounting.counterparties}
                  className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                  title="Справочник контрагентов"
                >
                  <div className="birzha-kpi-tile__label">Контрагентов</div>
                  <div className="birzha-kpi-tile__value">
                    {counterpartiesQ.isPending ? "…" : counterpartiesQ.data?.counterparties.length ?? "—"}
                  </div>
                </Link>
              ) : null}
            </div>

            {(pdErr || cpErr) && (
              <p role="status" className="birzha-callout-warning" style={{ margin: 0 }}>
                {pdErr ? "Накладные закупки: ошибка загрузки." : null}
                {pdErr && cpErr ? " " : ""}
                {cpErr ? "Контрагенты: ошибка загрузки." : null}
              </p>
            )}
            </BirzhaDisclosure>

            <BirzhaDisclosure title="Диаграммы" defaultOpen={false}>
            <div className="birzha-dashboard-row">
              <div className="birzha-chart-card birzha-chart-card--premium">
                <h3>Масса: склад · погружено · продано</h3>
                <MassBalanceStrip
                  warehouseKg={aggregates.warehouseKg}
                  transitKg={aggregates.transitKg}
                  soldKg={aggregates.soldKg}
                />
              </div>
              <div className="birzha-chart-card birzha-chart-card--premium">
                <h3>Топ складов по остатку</h3>
                <HorizontalBarChart
                  items={aggregates.warehouseBars}
                  emptyHint="Нет данных."
                  valueSuffix="кг"
                />
              </div>
              <div className="birzha-chart-card birzha-chart-card--premium">
                <h3>Виды товара (вес партий)</h3>
                <HorizontalBarChart
                  items={aggregates.groupBars}
                  emptyHint="Нет данных."
                  valueSuffix="кг"
                />
              </div>
            </div>
            </BirzhaDisclosure>

            <BirzhaDisclosure title="Рейсы" defaultOpen>
            <div className="birzha-admin-dash__trips">
              <p style={{ margin: "0 0 0.5rem" }}>
                <Link to={adminRoutes.tripRegistry} style={{ fontWeight: 600 }}>
                  Все рейсы
                </Link>
              </p>
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table className="birzha-admin-trips-table" style={tableStyle} aria-label="Последние рейсы">
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
                    {tripsPageSlice.map((t) => (
                      <tr key={t.id}>
                        <th scope="row" style={thtd}>
                          <strong>{t.tripNumber}</strong>
                        </th>
                        <td style={thtd}>
                          <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
                          {tripListShowsSoldOut(t) ? (
                            <span
                              className="birzha-text-muted birzha-ui-sm"
                              style={{ display: "block", marginTop: "0.2rem", fontWeight: 400 }}
                            >
                              0 погружено
                            </span>
                          ) : null}
                        </td>
                        <td className="birzha-text-muted birzha-text-muted--lg" style={thtd}>
                          {[t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          <Link
                            to={`${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                            style={{ fontWeight: 600 }}
                          >
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
                    ))}
                  </tbody>
                </table>
              </div>
              {closeTripMut.isError ? (
                <p className="birzha-text-danger birzha-ui-sm" style={{ marginTop: "0.35rem" }} role="alert">
                  {(closeTripMut.error as Error).message}
                </p>
              ) : null}
              <BirzhaPagination
                pageIndex={tripsPage}
                pageCount={tripsPageCount}
                itemLabel="рейсов"
                onPageChange={setTripsPage}
              />
            </div>
            </BirzhaDisclosure>
          </div>
        </>
      )}
    </div>
  );
}
