import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { AccountingPurchaserExpensesPanel } from "./AccountingPurchaserExpensesPanel.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

type SupplierRow = {
  supplierKey: string;
  supplierName: string;
  purchaseTotalKopecks: string;
  paidKopecks: string;
  remainingKopecks: string;
};

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
  operatingExpensesKopecks?: string;
  netProfitKopecks: string;
  purchaseTotalKopecks: string;
  supplierPaidKopecks: string;
  receivablesOutstandingKopecks: string;
  payablesOutstandingKopecks: string;
  bySupplier?: SupplierRow[];
};

/**
 * Главная бухкабинета: деньги с продаж → тепличники → расходы → остатки.
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
  const tripExp = s?.tripExpensesKopecks ?? s?.expensesKopecks ?? "0";
  const sellerExp = s?.sellerFieldExpensesKopecks ?? "0";
  const purchaserExp = s?.purchaserExpensesKopecks ?? "0";
  const sellerSends = s?.sellerMoneySendsKopecks ?? "0";
  const operating = s?.operatingExpensesKopecks ?? tripExp;

  return (
    <section className="birzha-home-premium birzha-section-shell" aria-labelledby="acc-home-h">
      <header className="birzha-home-hero birzha-home-hero--accounting birzha-section-hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h2 id="acc-home-h" className="birzha-home-hero__title">
            Касса и сверка
          </h2>
          <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: "0.35rem", maxWidth: "42rem" }}>
            Закуп у тепличников → отгрузка в регионы → деньги с продаж сюда → кассир отдаёт тепличникам и учитывает
            расходы закупщиков и продавцов.
          </p>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия бухгалтерии">
          <Link to={accounting.payables} className="birzha-home-action">
            <span>Тепличники</span>
            <strong>Выдать деньги</strong>
          </Link>
          <Link to={accounting.purchaserExpenses} className="birzha-home-action">
            <span>Закупщики</span>
            <strong>Их расходы</strong>
          </Link>
          <Link to={accounting.receivables} className="birzha-home-action">
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
          <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Пришло с продаж</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.revenueTotalKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                нал {kopecksToRubLabel(s.revenueCashKopecks)} · карта {kopecksToRubLabel(s.revenueCardKopecks)} · долг{" "}
                {kopecksToRubLabel(s.revenueDebtKopecks)}
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Купили у тепличников</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.purchaseTotalKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                отдали за период {kopecksToRubLabel(s.supplierPaidKopecks)}
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Ещё должны тепличникам</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.payablesOutstandingKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                <Link to={accounting.payables}>Выдать по накладным →</Link>
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Долги клиентов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.receivablesOutstandingKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                погашено за период {kopecksToRubLabel(s.debtPaidKopecks)}
              </div>
            </div>
          </div>

          <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Расходы закупщиков</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(purchaserExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">зарплата и прочее</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Расходы продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(sellerExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">полевые траты с кассы</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Отправки продавцов</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(sellerSends)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">кому / сколько / дата</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Расходы по рейсу</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(tripExp)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">топливо, дорога, водитель</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Валовая / чистая</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.grossProfitKopecks)} / {kopecksToRubLabel(s.netProfitKopecks)}
              </div>
              <div className="birzha-text-muted birzha-ui-sm">
                все расходы {kopecksToRubLabel(operating)} · себ. {kopecksToRubLabel(s.costOfSoldKopecks)}
              </div>
            </div>
          </div>

          {s.bySupplier && s.bySupplier.length > 0 ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Тепличники за период</h3>
              <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.5rem" }}>
                Сколько купили, сколько уже отдали, сколько ещё должны — по каждому.
              </p>
              <div className="birzha-table-scroll">
                <table style={{ ...tableStyle, minWidth: 480 }} aria-label="Тепличники за период">
                  <thead>
                    <tr>
                      <th style={thHead}>Тепличник</th>
                      <th style={{ ...thHead, textAlign: "right" }}>Купили</th>
                      <th style={{ ...thHead, textAlign: "right" }}>Отдали</th>
                      <th style={{ ...thHead, textAlign: "right" }}>Осталось</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.bySupplier.map((row) => (
                      <tr key={row.supplierKey}>
                        <td style={thtd}>{row.supplierName}</td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          {kopecksToRubLabel(row.purchaseTotalKopecks)}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.paidKopecks)}</td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          {kopecksToRubLabel(row.remainingKopecks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Расходы закупщиков</h3>
        <AccountingPurchaserExpensesPanel />
      </div>

      <AccountingStockBalances />
      <AccountingTripsSummary />
    </section>
  );
}
