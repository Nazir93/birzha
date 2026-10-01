import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { useAuth } from "../auth/auth-context.js";
import { canWriteAccounting } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
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
  category: string;
  amountKopecks: string;
  expenseDate: string;
  comment: string | null;
};

export function AccountingTripExpensesBlock({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteAccounting(user);
  const qc = useQueryClient();
  const [category, setCategory] = useState<"fuel" | "road" | "driver" | "other">("fuel");
  const [amountRub, setAmountRub] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");

  const listQ = useQuery({
    queryKey: ["accounting", "trip-expenses", tripId],
    queryFn: async () => {
      const res = await apiFetch(`/api/accounting/trips/${encodeURIComponent(tripId)}/expenses`);
      await assertOkResponse(res);
      return (await res.json()) as { totalKopecks: string; expenses: ExpenseRow[] };
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
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
      await qc.invalidateQueries({ queryKey: ["accounting", "trip-expenses", tripId] });
      await qc.invalidateQueries({ queryKey: ["shipment-report", tripId] });
    },
  });

  return (
    <BirzhaDisclosure
      defaultOpen
      title={
        <h3 id="trip-report-expenses" style={{ fontSize: "0.95rem", margin: 0 }}>
          Расходы по рейсу
        </h3>
      }
    >
      {listQ.isPending ? <LoadingBlock label="Расходы…" minHeight={48} skeleton skeletonRows={2} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Расходы" /> : null}
      {listQ.data ? (
        <>
          <p className="birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
            Итого: <strong>{kopecksToRubLabel(listQ.data.totalKopecks)} ₽</strong>
          </p>
          {listQ.data.expenses.length > 0 ? (
            <div className="birzha-table-scroll">
              <table style={{ ...tableStyle, minWidth: 480 }} aria-label="Расходы по рейсу">
                <thead>
                  <tr>
                    <th style={thHead}>Дата</th>
                    <th style={thHead}>Категория</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                    <th style={thHead}>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.expenses.map((e) => (
                    <tr key={e.id}>
                      <td style={thtd}>{e.expenseDate}</td>
                      <td style={thtd}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(e.amountKopecks)}</td>
                      <td style={thtd}>{e.comment ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="birzha-text-muted birzha-ui-sm">Расходов пока нет.</p>
          )}
        </>
      ) : null}
      {canWrite ? (
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.75rem", maxWidth: "22rem" }}>
          <label className="birzha-form-label">
            Категория
            <select style={fieldStyle} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              <option value="fuel">Топливо</option>
              <option value="road">Дорога</option>
              <option value="driver">Водитель</option>
              <option value="other">Прочее</option>
            </select>
          </label>
          <label className="birzha-form-label">
            Сумма, ₽
            <input style={fieldStyle} value={amountRub} onChange={(e) => setAmountRub(e.target.value)} />
          </label>
          <label className="birzha-form-label">
            Дата
            <BirzhaDateField aria-label="Дата расхода" value={expenseDate} onChange={setExpenseDate} style={dateFieldStyle} />
          </label>
          <label className="birzha-form-label">
            Комментарий
            <input style={fieldStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {addM.isError ? <ErrorAlert error={addM.error} title="Расход" /> : null}
          <button type="button" className={btnClassSpaced} disabled={addM.isPending} onClick={() => addM.mutate()}>
            Добавить расход
          </button>
        </div>
      ) : null}
    </BirzhaDisclosure>
  );
}
