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
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";

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
 * Сводка закупщика: KPI и разрез по складам только по своим накладным;
 * быстрые переходы — те же операционные разделы, что в сайдбаре.
 */
export function PurchaserCabinetHome() {
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("30d");
  const range = useMemo(() => periodRange(period), [period]);

  const q = useQuery({
    ...purchaseByPurchaserReportQueryOptions(range.from, range.to),
    refetchOnMount: "always",
  });

  const report = q.data;
  const grand = report?.grand;
  const byWarehouse = report?.byWarehouse ?? [];

  const warehouseRows = useMemo(
    () =>
      byWarehouse.map((w) => ({
        key: w.warehouseId,
        label: w.warehouseName,
        sublabel: `${w.documentCount} накл.`,
        kg: w.totalKg,
        packages: w.packageCount,
        valueKopecks: w.totalKopecks,
      })),
    [byWarehouse],
  );

  const warehouseMaxKg = Math.max(0, ...warehouseRows.map((r) => r.kg));

  const massSegments = useMemo(
    () =>
      byWarehouse.map((w, i) => ({
        label: w.warehouseName,
        kg: w.totalKg,
        fillClass: FILL[i % FILL.length]!,
      })),
    [byWarehouse],
  );

  const stockTotals = useMemo(() => {
    if (!grand) {
      return { kg: 0, packages: 0, valueKopecks: "0" };
    }
    return {
      kg: grand.totalKg,
      packages: grand.packageCount,
      valueKopecks: grand.totalKopecks,
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
                Ваши накладные за период: сумма, кг и ящики по складам.
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
              title="Закупочные накладные за период"
            >
              <div className="birzha-kpi-tile__label">Накладных</div>
              <div className="birzha-kpi-tile__value">{grand.documentCount}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">Закупка товара</div>
            </Link>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--violet">
              <div className="birzha-kpi-tile__label">Сумма</div>
              <div className="birzha-kpi-tile__value">{kopecksToRubDisplay(grand.totalKopecks)} ₽</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">По вашим накладным</div>
            </div>
            <Link
              to={ops.distribution}
              className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--tone-warn birzha-kpi-tile--link"
              title="Масса по вашим закупкам"
            >
              <div className="birzha-kpi-tile__label">Кг</div>
              <div className="birzha-kpi-tile__value">{formatDashboardKg(grand.totalKg)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">К погрузке</div>
            </Link>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue">
              <div className="birzha-kpi-tile__label">Ящики</div>
              <div className="birzha-kpi-tile__value">{grand.packageCount.toLocaleString("ru-RU")}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">За период</div>
            </div>
          </section>

          <div className="birzha-admin-dash-modern__layout">
            <section className="birzha-admin-dash-modern__chart-card">
              <div className="birzha-admin-dash-modern__chart-head">
                <h4 style={{ margin: 0, fontSize: "1rem" }}>По складам</h4>
                <Link to={ops.purchaseByPurchaser} className="birzha-ui-sm" style={{ fontWeight: 600 }}>
                  Подробнее
                </Link>
              </div>
              {massSegments.some((s) => s.kg > 0) ? (
                <MassBalanceLegend segments={massSegments} />
              ) : (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                  Нет накладных за выбранный период.
                </p>
              )}
              <SummaryTotalsStrip totals={stockTotals} caption="Итого закупки:" />
              <SummaryStockTable
                labelColumn="Склад"
                rows={warehouseRows}
                totals={stockTotals}
                maxKg={warehouseMaxKg}
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
