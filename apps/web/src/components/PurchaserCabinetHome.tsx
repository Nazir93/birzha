import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { purchaseByPurchaserReportQueryOptions } from "../query/core-list-queries.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { ops } from "../routes.js";
import { formatYmd } from "./BirzhaCalendarFields.js";
import {
  DashboardSummaryPeriodToggles,
  MassBalanceLegend,
  SummaryStockTable,
  SummaryTotalsStrip,
  dashboardPeriodStartDate,
  formatDashboardKg,
  type DashboardSummaryPeriod,
} from "./dashboard/dashboard-summary-ui.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

const FILL = [
  "birzha-admin-dash-modern__bar-fill--wh",
  "birzha-admin-dash-modern__bar-fill--lm",
  "birzha-admin-dash-modern__bar-fill--tr",
  "birzha-admin-dash-modern__bar-fill--sl",
] as const;

function periodRange(period: DashboardSummaryPeriod): { from: string; to: string } {
  const now = new Date();
  const to = formatYmd(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "all") {
    return { from: "2020-01-01", to };
  }
  const start = dashboardPeriodStartDate(period);
  if (!start) {
    return { from: to, to };
  }
  return {
    from: formatYmd(start.getFullYear(), start.getMonth(), start.getDate()),
    to,
  };
}

/**
 * Сводка закупщика: остаток на складе к погрузке + бухгалтерия по тепличникам.
 */
export function PurchaserCabinetHome() {
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("30d");
  const [sumOpen, setSumOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);

  const q = useQuery({
    ...purchaseByPurchaserReportQueryOptions(range.from, range.to),
    refetchOnMount: "always",
  });

  const report = q.data;
  const grand = report?.grand;
  const byWarehouse = report?.byWarehouse ?? [];
  const bySupplier = report?.bySupplier ?? [];
  const byWarehouseSupplier = report?.byWarehouseSupplier ?? [];

  const warehouseRows = useMemo(() => {
    return byWarehouse.map((w) => {
      const children = byWarehouseSupplier
        .filter((r) => r.warehouseId === w.warehouseId)
        .map((r) => ({
          key: `${r.warehouseId}:${r.supplierId ?? r.supplierName}`,
          label: r.supplierName,
          sublabel: `${r.documentsWithStockCount} накл.`,
          kg: r.onWarehouseKg,
          packages: r.onWarehousePackageCount,
          valueKopecks: r.onWarehouseValueKopecks,
        }));
      return {
        key: w.warehouseId,
        label: w.warehouseName,
        sublabel: `${w.documentsWithStockCount ?? 0} накл. · нажмите, чтобы раскрыть`,
        kg: w.onWarehouseKg ?? 0,
        packages: w.onWarehousePackageCount ?? 0,
        valueKopecks: w.onWarehouseValueKopecks ?? "0",
        children,
      };
    });
  }, [byWarehouse, byWarehouseSupplier]);

  const warehouseMaxKg = Math.max(0, ...warehouseRows.map((r) => r.kg));

  const massSegments = useMemo(
    () =>
      byWarehouse.map((w, i) => ({
        label: w.warehouseName,
        kg: w.onWarehouseKg ?? 0,
        fillClass: FILL[i % FILL.length]!,
      })),
    [byWarehouse],
  );

  const stockTotals = useMemo(() => {
    if (!grand) {
      return { kg: 0, packages: 0, valueKopecks: "0" };
    }
    return {
      kg: grand.onWarehouseKg ?? 0,
      packages: grand.onWarehousePackageCount ?? 0,
      valueKopecks: grand.onWarehouseValueKopecks ?? "0",
    };
  }, [grand]);

  const loading = q.isPending;
  const failed = q.isError;

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка закупщика</h2>

      {loading && !grand ? (
        <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={5} />
      ) : null}
      {failed ? (
        <ErrorAlert message="Не удалось загрузить сводку по вашим закупкам." title="Сводка" />
      ) : null}

      {!failed && grand ? (
        <>
          <header className="birzha-admin-dash-modern__hero">
            <div>
              <p className="birzha-home-hero__eyebrow">Закупки</p>
              <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0", maxWidth: "36rem" }}>
                Остаток на складе к погрузке. Сумма — ваша бухгалтерия по тепличникам: взял / отдал / осталось.
              </p>
              <DashboardSummaryPeriodToggles period={period} onChange={setPeriod} />
            </div>
            <nav className="birzha-admin-dash-modern__actions no-print" aria-label="Быстрые действия">
              <Link to={ops.purchaseNakladnaya} className="birzha-home-action">
                <strong>Закупка</strong>
              </Link>
              <Link to={ops.trips} className="birzha-home-action">
                <strong>Рейсы</strong>
              </Link>
              <Link to={ops.distribution} className="birzha-home-action">
                <strong>Погрузка</strong>
              </Link>
              <Link to={ops.expenses} className="birzha-home-action">
                <strong>Расходы</strong>
              </Link>
              <Link to={ops.warehouseReturns} className="birzha-home-action">
                <strong>Возврат</strong>
              </Link>
            </nav>
          </header>

          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Итоги периода">
            <Link
              to={ops.purchaseNakladnaya}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--tone-good birzha-kpi-tile--link"
              title="Накладные с остатком на складе"
            >
              <div className="birzha-kpi-tile__label">Накладных</div>
              <div className="birzha-kpi-tile__value">{grand.documentsWithStockCount ?? 0}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">С остатком на складе</div>
            </Link>
            <button
              type="button"
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--tone-good birzha-kpi-tile--link"
              title="Бухгалтерия по тепличникам"
              onClick={() => {
                setSumOpen(true);
                setPackagesOpen(false);
              }}
              style={{ cursor: "pointer", border: "none", font: "inherit", textAlign: "left" }}
            >
              <div className="birzha-kpi-tile__label">Сумма</div>
              <div className="birzha-kpi-tile__value">{kopecksToRubDisplay(grand.totalKopecks)} ₽</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">
                Отдал {kopecksToRubDisplay(grand.paidKopecks ?? "0")} · долг{" "}
                {kopecksToRubDisplay(grand.remainingPayableKopecks ?? "0")}
              </div>
            </button>
            <Link
              to={ops.distribution}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--tone-warn birzha-kpi-tile--link"
              title="Остаток кг к погрузке"
            >
              <div className="birzha-kpi-tile__label">Кг</div>
              <div className="birzha-kpi-tile__value">{formatDashboardKg(grand.onWarehouseKg ?? 0)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">К погрузке</div>
            </Link>
            <button
              type="button"
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--tone-warn birzha-kpi-tile--link"
              title="Остаток ящиков к погрузке"
              onClick={() => {
                setPackagesOpen(true);
                setSumOpen(false);
              }}
              style={{ cursor: "pointer", border: "none", font: "inherit", textAlign: "left" }}
            >
              <div className="birzha-kpi-tile__label">Ящики</div>
              <div className="birzha-kpi-tile__value">
                {(grand.onWarehousePackageCount ?? 0).toLocaleString("ru-RU")}
              </div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">К погрузке · открыть</div>
            </button>
          </section>

          {sumOpen ? (
            <section className="birzha-admin-dash-modern__chart-card" style={{ marginBottom: "0.85rem" }}>
              <BirzhaDisclosure
                defaultOpen
                title={
                  <span className="birzha-section-title-inline">
                    По тепличникам — взял / отдал / осталось
                  </span>
                }
              >
                {bySupplier.length === 0 ? (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>
                    Нет закупок за период.
                  </p>
                ) : (
                  <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                    <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Бухгалтерия по тепличникам">
                      <thead>
                        <tr>
                          <th style={thHead}>Тепличник</th>
                          <th style={{ ...thHead, textAlign: "right" }}>Взял, ₽</th>
                          <th style={{ ...thHead, textAlign: "right" }}>Отдал, ₽</th>
                          <th style={{ ...thHead, textAlign: "right" }}>Осталось, ₽</th>
                          <th style={{ ...thHead, textAlign: "right" }}>На складе, кг</th>
                          <th style={{ ...thHead, textAlign: "right" }}>Ящ.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bySupplier.map((s) => (
                          <tr key={`${s.supplierId ?? ""}:${s.supplierName}`}>
                            <td style={thtd}>
                              <strong>{s.supplierName}</strong>
                              <div className="birzha-text-muted birzha-ui-sm">
                                {s.documentCount} накл.
                                {s.documentsWithStockCount > 0
                                  ? ` · ${s.documentsWithStockCount} с остатком`
                                  : ""}
                              </div>
                            </td>
                            <td style={{ ...thtd, textAlign: "right" }}>
                              {kopecksToRubDisplay(s.totalKopecks)}
                            </td>
                            <td style={{ ...thtd, textAlign: "right" }}>
                              {kopecksToRubDisplay(s.paidKopecks)}
                            </td>
                            <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                              {kopecksToRubDisplay(s.remainingPayableKopecks)}
                            </td>
                            <td style={{ ...thtd, textAlign: "right" }}>
                              {formatDashboardKg(s.onWarehouseKg)}
                            </td>
                            <td style={{ ...thtd, textAlign: "right" }}>
                              {s.onWarehousePackageCount.toLocaleString("ru-RU")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th style={thtd}>Итого</th>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                            {kopecksToRubDisplay(grand.totalKopecks)}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                            {kopecksToRubDisplay(grand.paidKopecks ?? "0")}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                            {kopecksToRubDisplay(grand.remainingPayableKopecks ?? "0")}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                            {formatDashboardKg(grand.onWarehouseKg ?? 0)}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                            {(grand.onWarehousePackageCount ?? 0).toLocaleString("ru-RU")}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </BirzhaDisclosure>
            </section>
          ) : null}

          {packagesOpen ? (
            <section className="birzha-admin-dash-modern__chart-card" style={{ marginBottom: "0.85rem" }}>
              <BirzhaDisclosure
                defaultOpen
                title={<span className="birzha-section-title-inline">Ящики к погрузке по складам</span>}
              >
                <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.55rem" }}>
                  Только остаток на складе. Раскройте склад — тепличники и ящики.
                </p>
                <SummaryStockTable
                  labelColumn="Склад / тепличник"
                  rows={warehouseRows}
                  totals={stockTotals}
                  maxKg={warehouseMaxKg}
                  nestedGrades
                  collapsibleNested
                />
                <p style={{ margin: "0.65rem 0 0" }}>
                  <Link to={ops.distribution} style={{ fontWeight: 600 }}>
                    Перейти к погрузке →
                  </Link>
                </p>
              </BirzhaDisclosure>
            </section>
          ) : null}

          <div className="birzha-admin-dash-modern__layout">
            <section className="birzha-admin-dash-modern__chart-card">
              <div className="birzha-admin-dash-modern__chart-head">
                <h4 style={{ margin: 0, fontSize: "1rem" }}>По складам — остаток</h4>
                <Link to={ops.purchaseByPurchaser} className="birzha-ui-sm" style={{ fontWeight: 600 }}>
                  Подробнее
                </Link>
              </div>
              {massSegments.some((s) => s.kg > 0) ? (
                <MassBalanceLegend segments={massSegments} />
              ) : (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                  Нет остатка на складе за выбранный период.
                </p>
              )}
              <SummaryTotalsStrip totals={stockTotals} caption="Остаток на складе:" />
              <SummaryStockTable
                labelColumn="Склад / тепличник"
                rows={warehouseRows}
                totals={stockTotals}
                maxKg={warehouseMaxKg}
                nestedGrades
                collapsibleNested
              />
            </section>

            <aside className="birzha-admin-dash-modern__side">
              <section className="birzha-admin-dash-modern__side-card">
                <h4 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Разделы</h4>
                <nav
                  className="birzha-home-actions"
                  aria-label="Операции закупщика"
                  style={{ display: "grid", gap: "0.45rem" }}
                >
                  <Link to={ops.purchaseNakladnaya} className="birzha-home-action">
                    <span>Документы</span>
                    <strong>Закупка товара</strong>
                  </Link>
                  <Link to={ops.trips} className="birzha-home-action">
                    <span>Логистика</span>
                    <strong>Рейсы</strong>
                  </Link>
                  <Link to={ops.distribution} className="birzha-home-action">
                    <span>Отбор</span>
                    <strong>Погрузка на машину</strong>
                  </Link>
                  <Link to={ops.warehouseReturns} className="birzha-home-action">
                    <span>Склад</span>
                    <strong>Возврат на склад</strong>
                  </Link>
                  <Link to={ops.loadingAppend} className="birzha-home-action">
                    <span>ПН</span>
                    <strong>Догрузка</strong>
                  </Link>
                  <Link to={ops.loadingTrip} className="birzha-home-action">
                    <span>ПН</span>
                    <strong>Смена рейса</strong>
                  </Link>
                </nav>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
