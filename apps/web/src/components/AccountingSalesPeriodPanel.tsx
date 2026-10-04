import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import {
  accountingMonthBounds,
  readAccountingPeriodParams,
} from "../format/accounting-period.js";
import { kopecksToRubLabel } from "../format/money.js";
import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { AccountingTripsSummary } from "./AccountingTripsSummary.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle } from "../ui/styles.js";

type PeriodSummary = {
  revenueTotalKopecks: string;
  revenueCashKopecks: string;
  revenueCardKopecks: string;
  revenueDebtKopecks: string;
};

/**
 * Деньги с продаж за период и разбивка по рейсам.
 */
export function AccountingSalesPeriodPanel() {
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

  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <h2 className="birzha-section-title">Пришло с продаж</h2>
      <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: 0, maxWidth: "42rem" }}>
        Нал, карта и долг по дате выезда рейса. Ниже — рейсы с выручкой и ссылкой в отчёт.
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
      {periodQ.isPending ? <LoadingBlock label="Продажи…" minHeight={48} skeleton skeletonRows={2} /> : null}
      {periodQ.isError ? <ErrorAlert error={periodQ.error} title="Продажи" /> : null}
      {s ? (
        <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1.25rem" }}>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Всего</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.revenueTotalKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Нал</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.revenueCashKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Карта</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.revenueCardKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
            <div className="birzha-kpi-tile__label">Долг</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.revenueDebtKopecks)}
            </div>
          </div>
        </div>
      ) : null}
      <AccountingTripsSummary />
    </section>
  );
}
