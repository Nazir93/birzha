import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canWriteAccounting } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const CATEGORY_LABEL: Record<string, string> = {
  salary: "Зарплата",
  loading: "Погрузка",
  lunch: "Обед",
  foam: "Пенопласт",
  fuel: "Заправка",
  other: "Прочее",
};

type ExpenseRow = {
  id: string;
  category: string;
  amountKopecks: string;
  expenseDate: string;
  purchaserLabel: string | null;
  loadingManifestId?: string | null;
  comment: string | null;
};

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Расходы закупщиков: зарплата и прочее — проводит бухгалтерия.
 */
export function AccountingPurchaserExpensesPanel() {
  const { user } = useAuth();
  const canWrite = canWriteAccounting(user);
  const qc = useQueryClient();
  const defaults = useMemo(() => monthBounds(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [category, setCategory] = useState<"salary" | "other">("salary");
  const [amountRub, setAmountRub] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaserLabel, setPurchaserLabel] = useState("");
  const [comment, setComment] = useState("");

  const listQ = useQuery({
    queryKey: ["accounting", "purchaser-expenses", from, to],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/purchaser-expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      await assertOkResponse(res);
      return (await res.json()) as {
        totalKopecks: string;
        salaryKopecks: string;
        otherKopecks: string;
        expenses: ExpenseRow[];
      };
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму расхода в рублях");
      }
      await apiPostJson("/api/accounting/purchaser-expenses", {
        category,
        amountKopecks: Math.round(rub * 100),
        expenseDate,
        purchaserLabel: purchaserLabel.trim() || undefined,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["accounting", "purchaser-expenses"] });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  return (
    <div>
      <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: 0, maxWidth: "40rem" }}>
        Зарплата (здесь) и полевые расходы закупщика с ПН (погрузка, обед, пенопласт, заправка) — из кабинета
        закупщика. Отдельно от оплат тепличникам и трат продавца.
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

      {listQ.isPending ? <LoadingBlock label="Расходы закупщиков…" minHeight={48} skeleton skeletonRows={2} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Расходы закупщиков" /> : null}
      {listQ.data ? (
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Итого: <strong>{kopecksToRubLabel(listQ.data.totalKopecks)} ₽</strong>
          {" · "}
          зарплата {kopecksToRubLabel(listQ.data.salaryKopecks)} · прочее{" "}
          {kopecksToRubLabel(listQ.data.otherKopecks)}
        </p>
      ) : null}

      {canWrite ? (
        <form
          className="birzha-form-grid"
          style={{ marginBottom: "1rem", maxWidth: "36rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            addM.mutate();
          }}
        >
          <label className="birzha-form-label">
            Дата
            <BirzhaDateField
              aria-label="Дата расхода"
              value={expenseDate}
              onChange={setExpenseDate}
              style={dateFieldStyle}
            />
          </label>
          <label className="birzha-form-label">
            Категория
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as "salary" | "other")}
              style={fieldStyle}
            >
              <option value="salary">Зарплата</option>
              <option value="other">Прочее</option>
            </select>
          </label>
          <label className="birzha-form-label">
            Закупщик (имя)
            <input
              value={purchaserLabel}
              onChange={(e) => setPurchaserLabel(e.target.value)}
              style={fieldStyle}
              placeholder="Необязательно"
            />
          </label>
          <label className="birzha-form-label">
            Сумма, ₽
            <input
              value={amountRub}
              onChange={(e) => setAmountRub(e.target.value)}
              style={fieldStyle}
              inputMode="decimal"
              required
            />
          </label>
          <label className="birzha-form-label" style={{ gridColumn: "1 / -1" }}>
            Комментарий
            <input value={comment} onChange={(e) => setComment(e.target.value)} style={fieldStyle} />
          </label>
          <div>
            <button type="submit" className={btnClassSpaced} disabled={addM.isPending}>
              {addM.isPending ? "Сохранение…" : "Добавить расход"}
            </button>
          </div>
          {addM.isError ? <ErrorAlert error={addM.error} title="Не удалось сохранить" /> : null}
        </form>
      ) : null}

      {listQ.data && listQ.data.expenses.length > 0 ? (
        <div className="birzha-table-scroll">
          <table style={{ ...tableStyle, minWidth: 520 }} aria-label="Расходы закупщиков">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Закупщик</th>
                <th style={thHead}>Категория</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.expenses.map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{e.expenseDate}</td>
                  <td style={thtd}>{e.purchaserLabel || "—"}</td>
                  <td style={thtd}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(e.amountKopecks)}</td>
                  <td style={thtd}>{e.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {listQ.data && listQ.data.expenses.length === 0 ? (
        <p className="birzha-text-muted birzha-ui-sm">За период расходов нет.</p>
      ) : null}
    </div>
  );
}
