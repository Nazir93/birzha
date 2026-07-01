import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  buildMassSegments,
  gradeTableRows,
  warehouseTableRows,
} from "../format/admin-dashboard-summary-rows.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { adminDashboardSummaryQueryOptions } from "../query/core-list-queries.js";
import { accounting } from "../routes.js";
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
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";

/** Сводка товара и оценки по закупу — тот же источник, что в админке, без операционных блоков. */
export function AccountingDashboardSummary() {
  const [summaryPeriod, setSummaryPeriod] = useState<DashboardSummaryPeriod>("all");
  const [summaryChartMode, setSummaryChartMode] = useState<DashboardSummaryChartMode>("mass");

  const sinceParam = useMemo(() => {
    const start = dashboardPeriodStartDate(summaryPeriod);
    return start ? start.toISOString().slice(0, 10) : undefined;
  }, [summaryPeriod]);

  const summaryQ = useQuery({
    ...adminDashboardSummaryQueryOptions(sinceParam),
    refetchOnMount: "always",
  });

  const aggregates = useMemo(() => {
    const summary = summaryQ.data;
    if (!summary) {
      return null;
    }
    return {
      warehouseKg: summary.warehouse.warehouseKg,
      soldKg: summary.trips.soldKg,
      inTripRemainingKg: summary.trips.remainingInTripKg,
      loadingManifestKg: summary.loadingManifests.activeKg,
      stockTotals: summary.warehouse.stockTotals,
      tripsOpen: summary.trips.openCount,
      tripsClosed: summary.trips.closedCount,
      byGrade: summary.warehouse.byGrade,
      byWarehouse: summary.warehouse.byWarehouse,
    };
  }, [summaryQ.data]);

  const gradeRows = useMemo(
    () => (aggregates ? gradeTableRows(aggregates.byGrade) : []),
    [aggregates],
  );
  const warehouseRows = useMemo(
    () => (aggregates ? warehouseTableRows(aggregates.byWarehouse) : []),
    [aggregates],
  );
  const summaryTableMaxKg = useMemo(() => {
    const rows = summaryChartMode === "mass" ? gradeRows : warehouseRows;
    return rows[0]?.kg ?? 0;
  }, [gradeRows, summaryChartMode, warehouseRows]);

  const massSegments = useMemo(() => {
    if (!aggregates) {
      return [];
    }
    return buildMassSegments({
      warehouseKg: aggregates.warehouseKg,
      loadingManifestKg: aggregates.loadingManifestKg,
      inTripRemainingKg: aggregates.inTripRemainingKg,
      soldKg: aggregates.soldKg,
    });
  }, [aggregates]);

  if (summaryQ.isPending) {
    return <LoadingBlock label="Загрузка сводки…" minHeight={80} skeleton skeletonRows={5} />;
  }
  if (summaryQ.isError || !aggregates) {
    return (
      <ErrorAlert
        error={summaryQ.error}
        message="Не удалось загрузить сводку. Обновите страницу."
        title="Сводка"
      />
    );
  }

  return (
    <BirzhaDisclosure
      id="acc-stock"
      defaultOpen
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-heading__eyebrow">Сводка</span>
          <span id="acc-stock-h" className="birzha-section-title birzha-section-title--sm">
            Товар, масса и оценка по закупу
          </span>
        </span>
      }
    >
      <DashboardSummaryPeriodToggles period={summaryPeriod} onChange={setSummaryPeriod} />

      <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" style={{ marginTop: "0.85rem" }}>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--accent">
          <div className="birzha-kpi-tile__label">На складе</div>
          <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.warehouseKg)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">Физический остаток</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--violet">
          <div className="birzha-kpi-tile__label">В погрузочных</div>
          <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.loadingManifestKg)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">ПН в работе</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
          <div className="birzha-kpi-tile__label">В открытых рейсах</div>
          <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.inTripRemainingKg)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">Остаток в машине</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--blue">
          <div className="birzha-kpi-tile__label">Продано</div>
          <div className="birzha-kpi-tile__value">{formatDashboardKg(aggregates.soldKg)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">С открытых рейсов за период</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium">
          <div className="birzha-kpi-tile__label">Оценка в обороте</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {kopecksToRubDisplay(aggregates.stockTotals.valueKopecks)} ₽
          </div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">
            {formatDashboardKg(aggregates.stockTotals.kg)} · {aggregates.stockTotals.packages.toLocaleString("ru-RU")} ящ.
          </div>
        </div>
      </section>

      <section className="birzha-admin-dash-modern__chart-card" style={{ marginTop: "1rem" }}>
        <div className="birzha-admin-dash-modern__chart-head">
          <h4 style={{ margin: 0, fontSize: "1rem" }}>Распределение массы</h4>
          <Link to={accounting.reports} className="birzha-ui-sm" style={{ fontWeight: 600 }}>
            Отчёт по рейсу
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
        {summaryChartMode === "mass" ? (
          <>
            <div className="birzha-admin-dash-modern__mass-row">
              <MassDistributionRing
                warehouseKg={aggregates.warehouseKg}
                loadingManifestKg={aggregates.loadingManifestKg}
                inTripKg={aggregates.inTripRemainingKg}
                soldKg={aggregates.soldKg}
              />
              <MassBalanceLegend segments={massSegments} />
            </div>
            <h5 className="birzha-admin-dash-modern__subhead">По калибрам</h5>
            <SummaryStockTable
              labelColumn="Калибр"
              rows={gradeRows}
              totals={aggregates.stockTotals}
              maxKg={summaryTableMaxKg}
            />
          </>
        ) : (
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
        )}
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.75rem 0 0" }}>
          Открытых рейсов: <strong>{aggregates.tripsOpen}</strong>
          <span className="birzha-text-muted"> · </span>
          закрытых за период: <strong>{aggregates.tripsClosed}</strong>
          <span className="birzha-text-muted"> · </span>
          <a href="#acc-trips">Деньги по рейсам ↓</a>
        </p>
      </section>
    </BirzhaDisclosure>
  );
}
