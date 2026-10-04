import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canWriteAccounting } from "../auth/role-panels.js";
import {
  accountingMonthBounds,
  readAccountingPeriodParams,
} from "../format/accounting-period.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const CATEGORY_LABEL: Record<string, string> = {
  fuel: "Топливо",
  road: "Дорога",
  driver: "Водитель",
  other: "Прочее",
};

type ExpenseRow = {
  id: string;
  tripId: string;
  tripNumber: string;
  category: string;
  amountKopecks: string;
  expenseDate: string;
  comment: string | null;
};

/**
 * Все расходы по рейсам за период (топливо, дорога, водитель).
 */
export function AccountingTripExpensesPeriodPanel() {
  const { user } = useAuth();
  const canWrite = canWriteAccounting(user);
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => accountingMonthBounds(), []);
  const initial = useMemo(() => readAccountingPeriodParams(searchParams, defaults), [searchParams, defaults]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tripId, setTripId] = useState("");
  const [category, setCategory] = useState<"fuel" | "road" | "driver" | "other">("fuel");
  const [amountRub, setAmountRub] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const trips = tripsQ.data?.trips ?? [];

  const listQ = useQuery({
    queryKey: ["accounting", "trip-expenses-period", from, to],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/trip-expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      await assertOkResponse(res);
      return (await res.json()) as { totalKopecks: string; expenses: ExpenseRow[] };
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      if (!tripId) {
        throw new Error("Выберите рейс");
      }
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму расхода в рублях");
      }
      await apiPostJson(`/api/accounting/trips/${encodeURIComponent(tripId)}/expenses`, {
        category,
        amountKopecks: Math.round(rub * 100),
        expenseDate,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["accounting", "trip-expenses-period"] });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  return (
    <section className="birzha-card">
      <AccountingSectionBack />
      <h2 className="birzha-section-title">Расходы по рейсу</h2>
      <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: 0, maxWidth: "42rem" }}>
        Топливо, дорога, водитель — по всем рейсам за выбранные даты.
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

      {listQ.isPending ? <LoadingBlock label="Расходы…" minHeight={48} skeleton skeletonRows={3} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Расходы по рейсу" /> : null}
      {listQ.data ? (
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Итого: <strong>{kopecksToRubLabel(listQ.data.totalKopecks)} ₽</strong>
        </p>
      ) : null}

      {canWrite ? (
        <div style={{ display: "grid", gap: "0.45rem", marginBottom: "1rem", maxWidth: "24rem" }}>
          <strong style={{ fontSize: "0.95rem" }}>Новый расход</strong>
          <label className="birzha-form-label">
            Рейс
            <BirzhaSelect
              aria-label="Рейс"
              style={fieldStyle}
              value={tripId}
              onChange={setTripId}
              placeholder="— выберите рейс —"
              options={[
                { value: "", label: "— выберите рейс —" },
                ...trips.map((t) => ({ value: t.id, label: formatTripSelectLabel(t) })),
              ]}
            />
          </label>
          <label className="birzha-form-label">
            Категория
            <BirzhaSelect
              aria-label="Категория"
              style={fieldStyle}
              value={category}
              onChange={(v) => setCategory(v as typeof category)}
              options={[
                { value: "fuel", label: "Топливо" },
                { value: "road", label: "Дорога" },
                { value: "driver", label: "Водитель" },
                { value: "other", label: "Прочее" },
              ]}
            />
          </label>
          <label className="birzha-form-label">
            Дата
            <BirzhaDateField aria-label="Дата расхода" value={expenseDate} onChange={setExpenseDate} style={dateFieldStyle} />
          </label>
          <label className="birzha-form-label">
            Сумма, ₽
            <input style={fieldStyle} value={amountRub} onChange={(e) => setAmountRub(e.target.value)} />
          </label>
          <label className="birzha-form-label">
            Комментарий
            <input style={fieldStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {addM.isError ? <ErrorAlert error={addM.error} title="Расход" /> : null}
          <button type="button" className={btnClassSpaced} disabled={addM.isPending} onClick={() => addM.mutate()}>
            Добавить
          </button>
        </div>
      ) : null}

      {listQ.data?.expenses.length === 0 ? <BirzhaEmptyState compact title="Расходов за период нет" /> : null}
      {listQ.data && listQ.data.expenses.length > 0 ? (
        <div className="birzha-table-scroll">
          <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Расходы по рейсам">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Рейс</th>
                <th style={thHead}>Категория</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.expenses.map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{e.expenseDate}</td>
                  <td style={thtd}>{e.tripNumber}</td>
                  <td style={thtd}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(e.amountKopecks)}</td>
                  <td style={thtd}>{e.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
