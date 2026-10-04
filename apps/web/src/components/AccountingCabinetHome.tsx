import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState, type ReactNode } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { accountingPathWithPeriod } from "../format/accounting-period.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaDateField, formatYmd } from "./BirzhaCalendarFields.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
import {
  DashboardSummaryPeriodToggles,
  dashboardPeriodStartDate,
  type DashboardSummaryPeriod,
} from "./dashboard/dashboard-summary-ui.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle } from "../ui/styles.js";

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
  tripExpensesKopecks?: string;
  sellerFieldExpensesKopecks?: string;
  purchaserExpensesKopecks?: string;
  sellerMoneySendsKopecks?: string;
  sellerRentExpensesKopecks?: string;
  operatingExpensesKopecks?: string;
  netProfitKopecks: string;
  purchaseTotalKopecks: string;
  supplierPaidKopecks: string;
  receivablesOutstandingKopecks: string;
  payablesOutstandingKopecks: string;
};

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

function KpiLink({
  to,
  extraClass,
  children,
}: {
  to: string;
  extraClass?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link${extraClass ? ` ${extraClass}` : ""}`}
    >
      {children}
    </Link>
  );
}

function money(v: string): string {
  return `${kopecksToRubDisplay(v)} ₽`;
}

/**
 * Сводка бухгалтера: те же окна, что у админа, только касса и сверка.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const canGoToAdminPanel = user ? canAccessCabinet(user, "admin") : false;
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("30d");
  const defaults = useMemo(() => periodRange("30d"), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const onPeriodChange = (next: DashboardSummaryPeriod) => {
    setPeriod(next);
    const range = periodRange(next);
    setFrom(range.from);
    setTo(range.to);
  };

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
  const tripExp = s?.tripExpensesKopecks ?? s?.expensesKopecks ?? "0";
  const sellerExp = s?.sellerFieldExpensesKopecks ?? "0";
  const rentExp = s?.sellerRentExpensesKopecks ?? "0";
  const purchaserExp = s?.purchaserExpensesKopecks ?? "0";
  const sellerSends = s?.sellerMoneySendsKopecks ?? "0";
  const operating = s?.operatingExpensesKopecks ?? tripExp;
  const href = (path: string) => accountingPathWithPeriod(path, from, to);

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка бухгалтерии</h2>

      <header className="birzha-admin-dash-modern__hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0", maxWidth: "38rem" }}>
            Только касса: продажи, тепличники, долги, расходы. Нажмите окно — внутри список по статье.
          </p>
          <DashboardSummaryPeriodToggles period={period} onChange={onPeriodChange} />
          <div className="birzha-admin-dash-modern__dates">
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
              С
              <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
            </label>
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
              По
              <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
            </label>
          </div>
        </div>
        <nav className="birzha-admin-dash-modern__actions no-print" aria-label="Быстрые действия">
          <Link to={href(accounting.payables)} className="birzha-home-action">
            <strong>Тепличники</strong>
          </Link>
          <Link to={href(accounting.receivables)} className="birzha-home-action">
            <strong>Долги</strong>
          </Link>
          <Link to={accounting.reports} className="birzha-home-action">
            <strong>Отчёт</strong>
          </Link>
          <Link to={accounting.counterparties} className="birzha-home-action">
            <strong>Контрагенты</strong>
          </Link>
          {canGoToAdminPanel ? (
            <Link to={adminRoutes.home} className="birzha-home-action">
              <strong>Админка</strong>
            </Link>
          ) : null}
        </nav>
      </header>

      {periodQ.isPending ? <LoadingBlock label="Сводка за период…" minHeight={72} skeleton skeletonRows={3} /> : null}
      {periodQ.isError ? <ErrorAlert error={periodQ.error} title="Сводка за период" /> : null}

      {s ? (
        <>
          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Деньги с продаж и долги">
            <KpiLink to={href(accounting.sales)} extraClass="birzha-kpi-tile--accent">
              <div className="birzha-kpi-tile__label">С продаж</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.revenueTotalKopecks)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">
                нал {money(s.revenueCashKopecks)} · карта {money(s.revenueCardKopecks)}
              </div>
            </KpiLink>
            <KpiLink to={href(accounting.payables)} extraClass="birzha-kpi-tile--violet">
              <div className="birzha-kpi-tile__label">Закуп тепличников</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.purchaseTotalKopecks)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">отдали {money(s.supplierPaidKopecks)}</div>
            </KpiLink>
            <KpiLink to={href(accounting.payables)} extraClass="birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Должны тепличникам</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {money(s.payablesOutstandingKopecks)}
              </div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">выдать по накладным</div>
            </KpiLink>
            <KpiLink to={href(accounting.receivables)} extraClass="birzha-kpi-tile--blue">
              <div className="birzha-kpi-tile__label">Долги клиентов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {money(s.receivablesOutstandingKopecks)}
              </div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">погашено {money(s.debtPaidKopecks)}</div>
            </KpiLink>
          </section>

          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Расходы и прибыль">
            <KpiLink to={href(accounting.purchaserExpenses)} extraClass="birzha-kpi-tile--accent">
              <div className="birzha-kpi-tile__label">Расходы закупщиков</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(purchaserExp)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">зарплата и прочее</div>
            </KpiLink>
            <KpiLink to={href(accounting.sellerExpenses)} extraClass="birzha-kpi-tile--violet">
              <div className="birzha-kpi-tile__label">Расходы продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(sellerExp)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">грузчик, обед, палеты</div>
            </KpiLink>
            <KpiLink to={href(accounting.rent)} extraClass="birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Аренда</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(rentExp)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">отдельно от полевых</div>
            </KpiLink>
            <KpiLink to={href(accounting.sellerSends)} extraClass="birzha-kpi-tile--blue">
              <div className="birzha-kpi-tile__label">Отправки продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(sellerSends)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">кому / сколько / дата</div>
            </KpiLink>
          </section>

          <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi birzha-admin-dash-modern__kpi--pair" aria-label="Рейс и прибыль">
            <KpiLink to={href(accounting.tripExpenses)} extraClass="birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Расходы по рейсу</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(tripExp)}</div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">топливо, дорога, водитель</div>
            </KpiLink>
            <KpiLink to={href(accounting.profit)} extraClass="birzha-kpi-tile--accent">
              <div className="birzha-kpi-tile__label">Валовая / чистая</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {money(s.grossProfitKopecks)} / {money(s.netProfitKopecks)}
              </div>
              <div className="birzha-kpi-tile__hint birzha-ui-sm">
                расходы {money(operating)} · себ. {money(s.costOfSoldKopecks)}
              </div>
            </KpiLink>
          </section>
        </>
      ) : null}

      <div className="birzha-admin-dash-modern__layout">
        <section className="birzha-admin-dash-modern__chart-card">
          <div className="birzha-admin-dash-modern__chart-head">
            <h4 style={{ margin: 0, fontSize: "1rem" }}>Остатки товара</h4>
          </div>
          <AccountingStockBalances />
        </section>
        <aside className="birzha-admin-dash-modern__ops-card">
          <h4 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Разделы</h4>
          <nav className="birzha-home-actions" aria-label="Разделы бухгалтерии" style={{ display: "grid", gap: "0.45rem" }}>
            <Link to={href(accounting.sales)} className="birzha-home-action">
              <span>Касса</span>
              <strong>Продажи</strong>
            </Link>
            <Link to={href(accounting.purchaserExpenses)} className="birzha-home-action">
              <span>Закупщики</span>
              <strong>Их расходы</strong>
            </Link>
            <Link to={href(accounting.sellerExpenses)} className="birzha-home-action">
              <span>Поле</span>
              <strong>Траты продавцов</strong>
            </Link>
            <Link to={href(accounting.rent)} className="birzha-home-action">
              <span>Помещение</span>
              <strong>Аренда</strong>
            </Link>
            <Link to={href(accounting.profit)} className="birzha-home-action">
              <span>Итог</span>
              <strong>Прибыль</strong>
            </Link>
          </nav>
        </aside>
      </div>
    </div>
  );
}
