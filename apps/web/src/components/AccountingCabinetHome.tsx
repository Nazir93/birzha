import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle } from "../ui/styles.js";

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

type PeriodSummary = {
  from: string;
  to: string;
  revenueTotalKopecks: string;
  revenueCashKopecks: string;
  revenueCardKopecks: string;
  revenueDebtKopecks: string;
  debtPaidKopecks: string;
  costOfSoldKopecks: string;
  costOfShortageKopecks: string;
  grossProfitKopecks: string;
  expensesKopecks: string;
  netProfitKopecks: string;
  purchaseTotalKopecks: string;
  supplierPaidKopecks: string;
  receivablesOutstandingKopecks: string;
  payablesOutstandingKopecks: string;
};

/**
 * Главная бухкабинета: период, KPI, остатки, деньги по рейсам.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const canGoToAdminPanel = user ? canAccessCabinet(user, "admin") : false;
  const defaults = useMemo(() => monthBounds(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const periodQ = useQuery({
    queryKey: ["accounting", "period-summary", from, to],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/period-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      await assertOkResponse(res);
      return (await res.json()) as PeriodSummary;
    },
  });

  const s = periodQ.data;

  return (
    <section className="birzha-home-premium birzha-section-shell" aria-labelledby="acc-home-h">
      <header className="birzha-home-hero birzha-home-hero--accounting birzha-section-hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h2 id="acc-home-h" className="birzha-home-hero__title">
            Сверка и деньги
          </h2>
          <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: "0.35rem", maxWidth: "42rem" }}>
            Период, остатки, дебиторка и кредиторка, отчёты по рейсам. Без закупочных цен у продавца — здесь полный
            контур.
          </p>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия бухгалтерии">
          <Link to={accounting.receivables} className="birzha-home-action">
            <span>Клиенты</span>
            <strong>Дебиторка</strong>
          </Link>
          <Link to={accounting.payables} className="birzha-home-action">
            <span>Тепличники</span>
            <strong>Кредиторка</strong>
          </Link>
          <Link to={accounting.reports} className="birzha-home-action">
            <span>Отчёт</span>
            <strong>Детали рейса</strong>
          </Link>
          <Link to={accounting.counterparties} className="birzha-home-action">
            <span>Справочник</span>
            <strong>Контрагенты</strong>
          </Link>
          {canGoToAdminPanel ? (
            <Link to={adminRoutes.home} className="birzha-home-action">
              <span>Переход</span>
              <strong>В админ-панель</strong>
            </Link>
          ) : null}
        </nav>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", alignItems: "end" }}>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          С
          <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          По
          <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
        </label>
      </div>

      {periodQ.isPending ? <LoadingBlock label="Сводка за период…" minHeight={72} skeleton skeletonRows={3} /> : null}
      {periodQ.isError ? <ErrorAlert error={periodQ.error} title="Сводка за период" /> : null}
      {s ? (
        <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Выручка</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.revenueTotalKopecks)}
            </div>
            <div className="birzha-text-muted birzha-ui-sm">
              нал {kopecksToRubLabel(s.revenueCashKopecks)} · карта {kopecksToRubLabel(s.revenueCardKopecks)} · долг{" "}
              {kopecksToRubLabel(s.revenueDebtKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Валовая / чистая</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.grossProfitKopecks)} / {kopecksToRubLabel(s.netProfitKopecks)}
            </div>
            <div className="birzha-text-muted birzha-ui-sm">
              расходы {kopecksToRubLabel(s.expensesKopecks)} · себ. {kopecksToRubLabel(s.costOfSoldKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
            <div className="birzha-kpi-tile__label">Дебиторка (остаток)</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.receivablesOutstandingKopecks)}
            </div>
            <div className="birzha-text-muted birzha-ui-sm">
              оплат за период {kopecksToRubLabel(s.debtPaidKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
            <div className="birzha-kpi-tile__label">Кредиторка (остаток)</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.payablesOutstandingKopecks)}
            </div>
            <div className="birzha-text-muted birzha-ui-sm">
              закуп {kopecksToRubLabel(s.purchaseTotalKopecks)} · оплат {kopecksToRubLabel(s.supplierPaidKopecks)}
            </div>
          </div>
        </div>
      ) : null}

      <AccountingStockBalances />
      <AccountingTripsSummary />
    </section>
  );
}
