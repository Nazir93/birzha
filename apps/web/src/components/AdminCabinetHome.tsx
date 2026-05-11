import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  batchesFullListQueryOptions,
  counterpartiesFullListQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { formatTripStatusLabel } from "../format/trip-label.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { HorizontalBarChart, type HorizontalBarItem } from "../ui/charts/HorizontalBarChart.js";
import { MassBalanceStrip } from "../ui/charts/MassBalanceStrip.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, tableStyle, thHead, thtd } from "../ui/styles.js";

const ADMIN_TRIPS_PAGE_SIZE = 15;

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
      aria-label={`Распределение массы: на складе ${warehouseKg.toFixed(0)} кг, в пути ${transitKg.toFixed(0)} кг, продано ${soldKg.toFixed(0)} кг`}
    >
      <div className="birzha-admin-mass-ring__hole" />
    </div>
  );
}

/**
 * Дашборд администратора: KPI, распределение массы, топ складов/видов товара, рейсы.
 */
export function AdminCabinetHome() {
  const { meta } = useAuth();

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
    let pendingInboundKg = 0;
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
      pendingInboundKg += b.pendingInboundKg ?? 0;
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

    return {
      tripCount: trips.length,
      tripsOpen,
      tripsClosed,
      batchCount: batches.length,
      warehouseKg,
      transitKg,
      soldKg,
      pendingInboundKg,
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

  const pdErr = purchaseDocsQ.isError && meta?.purchaseDocumentsApi === "enabled";
  const cpErr = counterpartiesQ.isError && meta?.counterpartyCatalogApi === "enabled";

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка</h2>

      {loading && <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={5} />}
      {err && (
        <p role="alert" style={errorText}>
          Часть данных не загрузилась. Проверьте API.
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
                  <span className="birzha-admin-dash__legend-dot birzha-admin-dash__legend-dot--tr" /> В пути
                </li>
                <li>
                  <span className="birzha-admin-dash__legend-dot birzha-admin-dash__legend-dot--sl" /> Продано
                </li>
              </ul>
            </Link>
            <div className="birzha-admin-dash__hero-stats">
              <Link
                to={adminRoutes.distribution}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--link"
                title="Остатки на складах — распределение"
              >
                <span className="birzha-admin-stat__label">На складах</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--amber birzha-admin-stat--link"
                title="Рейсы и отчёты — масса в пути по рейсам"
              >
                <span className="birzha-admin-stat__label">В пути</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-admin-stat birzha-admin-stat--xl birzha-admin-stat--blue birzha-admin-stat--link"
                title="Продажи и отчёты по рейсам"
              >
                <span className="birzha-admin-stat__label">Продано (партии)</span>
                <span className="birzha-admin-stat__value">
                  {aggregates.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг
                </span>
              </Link>
            </div>
          </header>

          <div className="birzha-dashboard-layout birzha-admin-dash__body">
            <BirzhaDisclosure title="Сводные показатели" hint="рейсы, партии, склады" defaultOpen>
            <div className="birzha-kpi-grid birzha-kpi-grid--wide birzha-admin-dash__kpi">
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Все рейсы и отчёты"
              >
                <div className="birzha-kpi-tile__label">Рейсов</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripCount}</div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Открытые рейсы — в отчётах"
              >
                <div className="birzha-kpi-tile__label">Открытых</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripsOpen}</div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Закрытые рейсы — в отчётах"
              >
                <div className="birzha-kpi-tile__label">Закрытых</div>
                <div className="birzha-kpi-tile__value">{aggregates.tripsClosed}</div>
              </Link>
              <Link
                to={adminRoutes.distribution}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Партии и распределение по накладным"
              >
                <div className="birzha-kpi-tile__label">Партий</div>
                <div className="birzha-kpi-tile__value">{aggregates.batchCount}</div>
              </Link>
              <Link
                to={adminRoutes.distribution}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent birzha-kpi-tile--link"
                title="Остатки на складах"
              >
                <div className="birzha-kpi-tile__label">На складах, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber birzha-kpi-tile--link"
                title="Масса в пути — детали в отчётах по рейсам"
              >
                <div className="birzha-kpi-tile__label">В пути, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.reports}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue birzha-kpi-tile--link"
                title="Продано — отчёты по рейсам"
              >
                <div className="birzha-kpi-tile__label">Продано, кг</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.purchaseNakladnaya}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Закупка: накладные и ожидаемое поступление"
              >
                <div className="birzha-kpi-tile__label">Ожидает поступления</div>
                <div className="birzha-kpi-tile__value">
                  {aggregates.pendingInboundKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                </div>
              </Link>
              <Link
                to={adminRoutes.distribution}
                className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link"
                title="Списание с остатка на складе (брак и т.п.) — распределение"
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
                {pdErr ? "Список накладных закупки не подгрузился — проверьте API." : null}
                {pdErr && cpErr ? " " : ""}
                {cpErr ? "Справочник контрагентов не подгрузился — проверьте API." : null}
              </p>
            )}
            </BirzhaDisclosure>

            <BirzhaDisclosure title="Диаграммы" hint="масса, склады, виды товара" defaultOpen={false}>
            <div className="birzha-dashboard-row">
              <div className="birzha-chart-card birzha-chart-card--premium">
                <h3>Масса: склад · в пути · продано</h3>
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
                  emptyHint="Нет остатков по складам или не привязаны склады в накладных."
                  valueSuffix="кг"
                />
              </div>
              <div className="birzha-chart-card birzha-chart-card--premium">
                <h3>Виды товара (вес партий)</h3>
                <HorizontalBarChart
                  items={aggregates.groupBars}
                  emptyHint="Нет партий или виды не заполнены."
                  valueSuffix="кг"
                />
              </div>
            </div>
            </BirzhaDisclosure>

            <BirzhaDisclosure title="Рейсы" hint="последние, отчёт" defaultOpen>
            <div className="birzha-admin-dash__trips">
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.88rem", lineHeight: 1.45 }}>
                <Link to={adminRoutes.reports} style={{ fontWeight: 600 }}>
                  Все рейсы и отчёты
                </Link>
                <span className="birzha-text-muted">
                  {" "}
                  — полный список; здесь постранично ({ADMIN_TRIPS_PAGE_SIZE} на страницу).
                </span>
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
                    </tr>
                  </thead>
                  <tbody>
                    {tripsPageSlice.map((t) => (
                      <tr key={t.id}>
                        <th scope="row" style={thtd}>
                          <strong>{t.tripNumber}</strong>
                        </th>
                        <td style={thtd}>{formatTripStatusLabel(t.status)}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
