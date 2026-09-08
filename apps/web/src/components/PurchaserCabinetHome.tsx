import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { purchaseByPurchaserReportQueryOptions } from "../query/core-list-queries.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { ops } from "../routes.js";
import { formatYmd } from "./BirzhaCalendarFields.js";
import {
  DashboardSummaryPeriodToggles,
  dashboardPeriodStartDate,
  type DashboardSummaryPeriod,
} from "./dashboard/dashboard-summary-ui.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";

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

function kgLabel(kg: number): string {
  return kg.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

/**
 * Сводка закупщика: KPI только по накладным, где он указан закупщиком.
 */
export function PurchaserCabinetHome() {
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("30d");
  const range = useMemo(() => periodRange(period), [period]);

  const q = useQuery({
    ...purchaseByPurchaserReportQueryOptions(range.from, range.to),
    refetchOnMount: "always",
  });

  const grand = q.data?.grand;

  return (
    <div className="birzha-home-premium birzha-section-shell" aria-labelledby="purchaser-cabinet-h">
      <header className="birzha-home-hero birzha-section-hero" style={{ marginBottom: "1rem" }}>
        <div>
          <p className="birzha-home-hero__eyebrow">Закупки</p>
          <h2 id="purchaser-cabinet-h" className="birzha-home-hero__title">
            Сводка
          </h2>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0", maxWidth: "36rem" }}>
            Только накладные, которые вы приняли как закупщик: сумма, кг и ящики.
          </p>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Разделы закупщика">
          <Link to={ops.purchaseByPurchaser} className="birzha-home-action">
            <span>Отчёт</span>
            <strong>Мои закупки</strong>
          </Link>
          <Link to={ops.purchaseNakladnaya} className="birzha-home-action">
            <span>Документы</span>
            <strong>Закупка товара</strong>
          </Link>
          <Link to={ops.reports} className="birzha-home-action">
            <span>Рейсы</span>
            <strong>Отчёты и рейсы</strong>
          </Link>
        </nav>
      </header>

      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <DashboardSummaryPeriodToggles period={period} onChange={setPeriod} />
      </div>

      {q.isError ? (
        <ErrorAlert message="Не удалось загрузить сводку по вашим закупкам." title="Сводка" />
      ) : null}

      {q.isFetching && !grand ? (
        <LoadingBlock label="Загрузка сводки…" minHeight={100} skeleton skeletonRows={4} />
      ) : null}

      {grand ? (
        <div className="birzha-admin-dash-modern__kpi" role="group" aria-label="Итоги периода">
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Накладных</div>
            <div className="birzha-kpi-tile__value">{grand.documentCount}</div>
          </div>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Сумма</div>
            <div className="birzha-kpi-tile__value">{kopecksToRubDisplay(grand.totalKopecks)} ₽</div>
          </div>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Кг</div>
            <div className="birzha-kpi-tile__value">{kgLabel(grand.totalKg)}</div>
          </div>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Ящики</div>
            <div className="birzha-kpi-tile__value">{grand.packageCount}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
