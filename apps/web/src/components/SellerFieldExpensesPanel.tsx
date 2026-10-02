import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { filterTripsAssignedToSellerForReports, isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { sales } from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const CATEGORY_LABEL: Record<string, string> = {
  loader: "Грузчик",
  lunch: "Обед",
  pallets: "Палеты",
  rent: "Аренда",
  materials: "Материал",
  other: "Прочее",
};

type ExpenseRow = {
  id: string;
  tripId: string;
  expenseDate: string;
  category: string;
  amountKopecks: string;
  comment: string | null;
};

type Settlement = {
  cashKopecks: string;
  cardTransferKopecks: string;
  debtKopecks: string;
  fieldExpensesKopecks: string;
  cashToHandOverKopecks: string;
};

type GroupRow = {
  key: string;
  label: string;
  totalKopecks: string;
  count: number;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function SellerFieldExpensesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fieldOnly = Boolean(user && isFieldSellerOnly(user));
  const defaults = useMemo(() => monthBounds(), []);
  const [tripId, setTripId] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const [expenseDate, setExpenseDate] = useState(todayYmd);
  const [category, setCategory] = useState<"loader" | "lunch" | "pallets" | "rent" | "materials" | "other">("loader");
  const [amountRub, setAmountRub] = useState("");
  const [comment, setComment] = useState("");

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const tripsForSelect = useMemo(() => {
    let list = tripsQ.data?.trips ?? [];
    if (fieldOnly && user) {
      list = filterTripsAssignedToSellerForReports(list, user.id);
    }
    return list.filter(isTripOpenForSellerWorkspace);
  }, [tripsQ.data, fieldOnly, user]);

  const listQ = useQuery({
    queryKey: ["seller-field-expenses", tripId, from, to, group],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to, group });
      if (tripId) {
        params.set("tripId", tripId);
      }
      const res = await apiFetch(`/api/seller-field-expenses?${params}`);
      await assertOkResponse(res);
      return (await res.json()) as {
        expenses: ExpenseRow[];
        groups: GroupRow[];
        settlement: Settlement;
      };
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      if (!tripId) {
        throw new Error("Выберите рейс");
      }
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму в рублях");
      }
      await apiPostJson("/api/seller-field-expenses", {
        tripId,
        expenseDate,
        category,
        amountKopecks: Math.round(rub * 100),
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["seller-field-expenses"] });
      if (tripId) {
        await qc.invalidateQueries({ queryKey: ["shipment-report", tripId] });
      }
    },
  });

  const delM = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/seller-field-expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
      await assertOkResponse(res);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["seller-field-expenses"] });
      if (tripId) {
        await qc.invalidateQueries({ queryKey: ["shipment-report", tripId] });
      }
    },
  });

  const s = listQ.data?.settlement;

  return (
    <div role="region" aria-label="Траты и расчёт">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Траты / расчёт</h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem", maxWidth: "40rem" }}>
        Траты с кассы по рейсу и дате: грузчик, обед, палеты, аренда. К сдаче = нал − траты. Сверка по дням, неделям и
        месяцам.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: "0.85rem", alignItems: "end" }}>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "14rem", flex: "1 1 14rem" }}>
          Рейс
          <select style={fieldStyle} value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">Все свои (только сверка)</option>
            {tripsForSelect.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTripSelectLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          С
          <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          По
          <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.85rem" }}>
        {(["day", "week", "month"] as const).map((g) => (
          <button
            key={g}
            type="button"
            className={group === g ? "birzha-btn" : "birzha-clean-ops-text-btn"}
            onClick={() => setGroup(g)}
          >
            {g === "day" ? "Дни" : g === "week" ? "Недели" : "Месяцы"}
          </button>
        ))}
      </div>

      {listQ.isPending ? <LoadingBlock label="Сверка…" minHeight={64} skeleton skeletonRows={3} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Траты" /> : null}

      {s ? (
        <div className="birzha-kpi-grid" style={{ marginBottom: "1rem" }}>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Нал</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{kopecksToRubLabel(s.cashKopecks)}</div>
          </div>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Карта / долг</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.cardTransferKopecks)} / {kopecksToRubLabel(s.debtKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile">
            <div className="birzha-kpi-tile__label">Траты</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.fieldExpensesKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--amber">
            <div className="birzha-kpi-tile__label">К сдаче</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(s.cashToHandOverKopecks)}
            </div>
          </div>
        </div>
      ) : null}

      {listQ.data && listQ.data.groups.length > 0 ? (
        <div className="birzha-table-scroll" style={{ marginBottom: "1rem" }}>
          <table style={{ ...tableStyle, minWidth: 420 }} aria-label="Сводка по периодам">
            <thead>
              <tr>
                <th style={thHead}>Период</th>
                <th style={{ ...thHead, textAlign: "right" }}>Трат</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма, ₽</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.groups.map((g) => (
                <tr key={g.key}>
                  <td style={thtd}>{g.label}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{g.count}</td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                    {kopecksToRubLabel(g.totalKopecks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "0.45rem", marginBottom: "1rem", maxWidth: "22rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>Новая трата</strong>
        <label className="birzha-form-label">
          Дата
          <BirzhaDateField aria-label="Дата траты" value={expenseDate} onChange={setExpenseDate} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label">
          Категория
          <select style={fieldStyle} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="loader">Грузчик</option>
            <option value="lunch">Обед</option>
            <option value="pallets">Палеты</option>
            <option value="rent">Аренда</option>
            <option value="materials">Материал</option>
            <option value="other">Прочее</option>
          </select>
        </label>
        <label className="birzha-form-label">
          Сумма, ₽
          <input style={fieldStyle} value={amountRub} onChange={(e) => setAmountRub(e.target.value)} />
        </label>
        <label className="birzha-form-label">
          Комментарий
          <input style={fieldStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        {addM.isError ? <ErrorAlert error={addM.error} title="Трата" /> : null}
        <button type="button" className={btnClassSpaced} disabled={addM.isPending || !tripId} onClick={() => addM.mutate()}>
          Добавить
        </button>
        {!tripId ? (
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>
            Для записи выберите открытый рейс.
          </p>
        ) : null}
      </div>

      {listQ.data?.expenses.length === 0 ? <BirzhaEmptyState compact title="Трат за период нет" /> : null}
      {listQ.data && listQ.data.expenses.length > 0 ? (
        <div className="birzha-table-scroll">
          <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Список трат">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Категория</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
                <th style={thHead} />
              </tr>
            </thead>
            <tbody>
              {listQ.data.expenses.map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{e.expenseDate}</td>
                  <td style={thtd}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(e.amountKopecks)}</td>
                  <td style={thtd}>{e.comment ?? "—"}</td>
                  <td style={thtd}>
                    <button
                      type="button"
                      className="birzha-clean-ops-text-btn"
                      disabled={delM.isPending}
                      onClick={() => {
                        if (window.confirm("Удалить трату?")) {
                          void delM.mutate(e.id);
                        }
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="birzha-ui-sm" style={{ marginTop: "1rem" }}>
        <Link to={sales.reports}>Отчёт по рейсу</Link> — нал, траты и «к сдаче» по машине.
      </p>
    </div>
  );
}
