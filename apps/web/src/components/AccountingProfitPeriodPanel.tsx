import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import {
  accountingMonthBounds,
  accountingPathWithPeriod,
  readAccountingPeriodParams,
} from "../format/accounting-period.js";
import { kopecksToRubLabel } from "../format/money.js";
import { accounting } from "../routes.js";
import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

type PeriodSummary = {
  revenueTotalKopecks: string;
  costOfSoldKopecks: string;
  grossProfitKopecks: string;
  netProfitKopecks: string;
  tripExpensesKopecks?: string;
  expensesKopecks: string;
  sellerFieldExpensesKopecks?: string;
  sellerRentExpensesKopecks?: string;
  purchaserExpensesKopecks?: string;
  sellerMoneySendsKopecks?: string;
  operatingExpensesKopecks?: string;
};

/**
 * Сводка валовой и чистой: из чего складывается.
 */
export function AccountingProfitPeriodPanel() {
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => accountingMonthBounds(), []);
  const initial = useMemo(() => readAccountingPeriodParams(searchParams, defaults), [searchParams, defaults]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

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
  const p = (path: string) => accountingPathWithPeriod(path, from, to);

  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <h2 className="birzha-section-title">Валовая / чистая</h2>
      <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: 0, maxWidth: "42rem" }}>
        Валовая = выручка − себестоимость проданного. Чистая = валовая − все расходы кассы за период.
      </p>
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
      {periodQ.isPending ? <LoadingBlock label="Прибыль…" minHeight={48} skeleton skeletonRows={3} /> : null}
      {periodQ.isError ? <ErrorAlert error={periodQ.error} title="Прибыль" /> : null}
      {s ? (
        <>
          <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Валовая</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.grossProfitKopecks)}
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Чистая</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.netProfitKopecks)}
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Все расходы</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(s.operatingExpensesKopecks ?? "0")}
              </div>
            </div>
          </div>
          <div className="birzha-table-scroll">
            <table style={{ ...tableStyle, minWidth: 420 }} aria-label="Состав прибыли">
              <thead>
                <tr>
                  <th style={thHead}>Статья</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.sales)}>Выручка с продаж</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(s.revenueTotalKopecks)}</td>
                </tr>
                <tr>
                  <td style={thtd}>Себестоимость проданного</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(s.costOfSoldKopecks)}</td>
                </tr>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.purchaserExpenses)}>Расходы закупщиков</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>
                    {kopecksToRubLabel(s.purchaserExpensesKopecks ?? "0")}
                  </td>
                </tr>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.sellerExpenses)}>Расходы продавцов</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>
                    {kopecksToRubLabel(s.sellerFieldExpensesKopecks ?? "0")}
                  </td>
                </tr>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.rent)}>Аренда</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>
                    {kopecksToRubLabel(s.sellerRentExpensesKopecks ?? "0")}
                  </td>
                </tr>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.sellerSends)}>Отправки продавцов</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>
                    {kopecksToRubLabel(s.sellerMoneySendsKopecks ?? "0")}
                  </td>
                </tr>
                <tr>
                  <td style={thtd}>
                    <Link to={p(accounting.tripExpenses)}>Расходы по рейсу</Link>
                  </td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(tripExp)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
