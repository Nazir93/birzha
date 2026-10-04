import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState, type ReactNode } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { accountingMonthBounds, accountingPathWithPeriod } from "../format/accounting-period.js";
import { kopecksToRubLabel } from "../format/money.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
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

/**
 * Главная бухкабинета: деньги с продаж → тепличники → расходы → остатки.
 */
export function AccountingCabinetHome() {
  const { user } = useAuth();
  const canGoToAdminPanel = user ? canAccessCabinet(user, "admin") : false;
  const defaults = useMemo(() => accountingMonthBounds(), []);
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
  const tripExp = s?.tripExpensesKopecks ?? s?.expensesKopecks ?? "0";
  const sellerExp = s?.sellerFieldExpensesKopecks ?? "0";
  const rentExp = s?.sellerRentExpensesKopecks ?? "0";
  const purchaserExp = s?.purchaserExpensesKopecks ?? "0";
  const sellerSends = s?.sellerMoneySendsKopecks ?? "0";
  const operating = s?.operatingExpensesKopecks ?? tripExp;
  const href = (path: string) => accountingPathWithPeriod(path, from, to);

  return (
    <section className="birzha-home-premium birzha-section-shell" aria-labelledby="acc-home-h">
      <header className="birzha-home-hero birzha-home-hero--accounting birzha-section-hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h2 id="acc-home-h" className="birzha-home-hero__title">
            Касса и сверка
          </h2>
          <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: "0.35rem", maxWidth: "42rem" }}>
            Нажмите на окно — внутри список и запись по этой статье. Закуп у тепличников → продажи сюда → расходы.
          </p>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия бухгалтерии">
          <Link to={href(accounting.payables)} className="birzha-home-action">
            <span>Тепличники</span>
            <strong>Выдать деньги</strong>
          </Link>
          <Link to={href(accounting.purchaserExpenses)} className="birzha-home-action">
            <span>Закупщики</span>
            <strong>Их расходы</strong>
          </Link>
          <Link to={href(accounting.receivables)} className="birzha-home-action">
            <span>Клиенты</span>
            <strong>Долги</strong>
          </Link>
          <Link to={accounting.reports} className="birzha-home-action">
            <span>Рейс</span>
            <strong>Отчёт</strong>
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
        <>
          <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.65rem" }}>
            Каждое окно открывает свой раздел.
          </p>
          <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
            <KpiLink to={href(accounting.sales)}>
              <div className="birzha-kpi-tile__label">Пришло с продаж</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.revenueTotalKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                нал {kopecksToRubLabel(s.revenueCashKopecks)} · карта {kopecksToRubLabel(s.revenueCardKopecks)} · долг{" "}
                {kopecksToRubLabel(s.revenueDebtKopecks)}
              </div>
            </KpiLink>
            <KpiLink to={href(accounting.payables)}>
              <div className="birzha-kpi-tile__label">Купили у тепличников</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.purchaseTotalKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                отдали за период {kopecksToRubLabel(s.supplierPaidKopecks)}
              </div>
            </KpiLink>
            <KpiLink to={href(accounting.payables)} extraClass="birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Ещё должны тепличникам</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.payablesOutstandingKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">выдать по накладным</div>
            </KpiLink>
            <KpiLink to={href(accounting.receivables)} extraClass="birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Долги клиентов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.receivablesOutstandingKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                погашено за период {kopecksToRubLabel(s.debtPaidKopecks)}
              </div>
            </KpiLink>
          </div>

          <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
            <KpiLink to={href(accounting.purchaserExpenses)}>
              <div className="birzha-kpi-tile__label">Расходы закупщиков</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(purchaserExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">зарплата и прочее</div>
            </KpiLink>
            <KpiLink to={href(accounting.sellerExpenses)}>
              <div className="birzha-kpi-tile__label">Расходы продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(sellerExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">грузчик, обед, палеты</div>
            </KpiLink>
            <KpiLink to={href(accounting.rent)}>
              <div className="birzha-kpi-tile__label">Аренда</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(rentExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">отдельно от полевых трат</div>
            </KpiLink>
            <KpiLink to={href(accounting.sellerSends)}>
              <div className="birzha-kpi-tile__label">Отправки продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(sellerSends)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">кому / сколько / дата</div>
            </KpiLink>
            <KpiLink to={href(accounting.tripExpenses)}>
              <div className="birzha-kpi-tile__label">Расходы по рейсу</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(tripExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">топливо, дорога, водитель</div>
            </KpiLink>
            <KpiLink to={href(accounting.profit)}>
              <div className="birzha-kpi-tile__label">Валовая / чистая</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.grossProfitKopecks)} / {kopecksToRubLabel(s.netProfitKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                все расходы {kopecksToRubLabel(operating)} · себ. {kopecksToRubLabel(s.costOfSoldKopecks)}
              </div>
            </KpiLink>
          </div>
        </>
      ) : null}

      <AccountingStockBalances />
    </section>
  );
}
