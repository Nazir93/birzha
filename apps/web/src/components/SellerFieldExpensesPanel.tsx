import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { readAccountingPeriodParams } from "../format/accounting-period.js";
import { filterTripsAssignedToSellerForReports, isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import { sellerFieldExpenseCategoryLabel } from "../format/seller-field-expense-labels.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { queryRoots, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { sales } from "../routes.js";
import { BirzhaDateField, formatYmd } from "./BirzhaCalendarFields.js";
import { SellerMoneySendsPanel } from "./SellerMoneySendsPanel.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const CATEGORY_OPTIONS = [
  { value: "loader", label: "Грузчик" },
  { value: "lunch", label: "Обед" },
  { value: "pallets", label: "Палеты" },
  { value: "rent", label: "Аренда / бронь" },
  { value: "materials", label: "Материал" },
  { value: "other", label: "Прочее" },
] as const;

export type SellerFieldExpenseKind = "all" | "field" | "rent";

export type SellerFieldExpensesPanelProps = {
  kind?: SellerFieldExpenseKind;
  showMoneySends?: boolean;
  heading?: string;
  note?: string;
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

function localTodayYmd(): string {
  const n = new Date();
  return formatYmd(n.getFullYear(), n.getMonth(), n.getDate());
}

function localMonthBounds(): { from: string; to: string } {
  const n = new Date();
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  return {
    from: formatYmd(n.getFullYear(), n.getMonth(), 1),
    to: formatYmd(n.getFullYear(), n.getMonth(), last),
  };
}

function matchesKind(category: string, kind: SellerFieldExpenseKind): boolean {
  if (kind === "rent") {
    return category === "rent";
  }
  if (kind === "field") {
    return category !== "rent";
  }
  return true;
}

export function SellerFieldExpensesPanel({
  kind = "all",
  showMoneySends = true,
  heading,
  note,
}: SellerFieldExpensesPanelProps = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fieldOnly = Boolean(user && isFieldSellerOnly(user));
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => localMonthBounds(), []);
  const initial = useMemo(() => readAccountingPeriodParams(searchParams, defaults), [searchParams, defaults]);
  const [tripId, setTripId] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const [expenseDate, setExpenseDate] = useState(localTodayYmd);
  const categoryOptions = useMemo(() => {
    if (kind === "rent") {
      return CATEGORY_OPTIONS.filter((c) => c.value === "rent");
    }
    if (kind === "field") {
      return CATEGORY_OPTIONS.filter((c) => c.value !== "rent");
    }
    return [...CATEGORY_OPTIONS];
  }, [kind]);
  const [category, setCategory] = useState<"loader" | "lunch" | "pallets" | "rent" | "materials" | "other">(
    kind === "rent" ? "rent" : "loader",
  );
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

  useEffect(() => {
    if (tripId) {
      return;
    }
    if (tripsForSelect.length === 1) {
      setTripId(tripsForSelect[0]!.id);
    }
  }, [tripsForSelect, tripId]);

  const listQ = useQuery({
    queryKey: [...queryRoots.sellerFieldExpenses, tripId, from, to, group],
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
      if (expenseDate < from) {
        setFrom(expenseDate);
      }
      if (expenseDate > to) {
        setTo(expenseDate);
      }
      await qc.invalidateQueries({ queryKey: queryRoots.sellerFieldExpenses });
      await qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  const delM = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/seller-field-expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
      await assertOkResponse(res);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.sellerFieldExpenses });
      await qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  const s = listQ.data?.settlement;
  const visibleExpenses = useMemo(
    () => (listQ.data?.expenses ?? []).filter((e) => matchesKind(e.category, kind)),
    [listQ.data?.expenses, kind],
  );
  const visibleTotalKopecks = useMemo(
    () => visibleExpenses.reduce((acc, e) => acc + BigInt(e.amountKopecks || "0"), 0n).toString(),
    [visibleExpenses],
  );
  const tripLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tripsQ.data?.trips ?? []) {
      map.set(t.id, formatTripSelectLabel(t));
    }
    return map;
  }, [tripsQ.data?.trips]);
  const title =
    heading ?? (kind === "rent" ? "Аренда" : kind === "field" ? "Расходы продавцов" : "Траты / расчёт");
  const description =
    note ??
    (kind === "rent"
      ? "Аренда и бронь точки — списываются с кассы выбранного рейса (к сдаче = нал − все траты рейса)."
      : kind === "field"
        ? "Полевые траты с кассы: грузчик, обед, палеты. Аренда / бронь — отдельное окно на сводке бухгалтера, но тоже с рейса."
        : "Траты с кассы по выбранному рейсу: грузчик, обед, палеты, аренда/бронь. Все траты рейса видны продавцу и вычитаются из «к сдаче».");

  return (
    <div role="region" aria-label={title}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>{title}</h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem", maxWidth: "40rem" }}>
        {description}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: "0.85rem", alignItems: "end" }}>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "14rem", flex: "1 1 14rem" }}>
          Рейс
          <BirzhaSelect
            aria-label="Рейс"
            style={fieldStyle}
            value={tripId}
            onChange={setTripId}
            options={[
              { value: "", label: fieldOnly ? "Все свои (только сверка)" : "Все рейсы (список)" },
              ...tripsForSelect.map((t) => ({ value: t.id, label: formatTripSelectLabel(t) })),
            ]}
          />
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

      {kind === "all" ? (
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
      ) : null}

      {listQ.isPending ? <LoadingBlock label="Сверка…" minHeight={64} skeleton skeletonRows={3} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Траты" /> : null}

      {kind !== "all" && listQ.data ? (
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Итого: <strong>{kopecksToRubLabel(visibleTotalKopecks)} ₽</strong>
        </p>
      ) : null}

      {kind === "all" && s ? (
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

      {kind === "all" && listQ.data && listQ.data.groups.length > 0 ? (
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

      <h3 style={{ margin: "0 0 0.45rem", fontSize: "1rem" }}>
        Записанные траты
        {visibleExpenses.length > 0 ? ` (${visibleExpenses.length})` : ""}
      </h3>
      {visibleExpenses.length === 0 && listQ.data ? (
        <BirzhaEmptyState compact title={kind === "rent" ? "Аренды за период нет" : "Трат за период нет"} />
      ) : null}
      {visibleExpenses.length > 0 ? (
        <div className="birzha-table-scroll" style={{ marginBottom: "1.1rem" }}>
          <table style={{ ...tableStyle, minWidth: 640 }} aria-label="Список трат">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Рейс</th>
                <th style={thHead}>Категория</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
                <th style={thHead} />
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{e.expenseDate}</td>
                  <td style={thtd}>{tripLabelById.get(e.tripId) ?? e.tripId}</td>
                  <td style={thtd}>{sellerFieldExpenseCategoryLabel(e.category)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(e.amountKopecks)} ₽</td>
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
            <tfoot>
              <tr className="birzha-table-subtotal-row">
                <th scope="row" style={{ ...thtd, fontWeight: 700 }} colSpan={3}>
                  Итого
                </th>
                <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                  {kopecksToRubLabel(visibleTotalKopecks)} ₽
                </td>
                <td style={thtd} colSpan={2} />
              </tr>
            </tfoot>
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
          <BirzhaSelect
            aria-label="Категория"
            style={fieldStyle}
            value={category}
            onChange={(v) => setCategory(v as typeof category)}
            options={[...categoryOptions]}
          />
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
        {addM.isSuccess ? (
          <p className="birzha-ui-sm" style={{ margin: 0 }} role="status">
            Трата записана — она в списке выше и в отчёте по рейсу.
          </p>
        ) : null}
        <button type="button" className={btnClassSpaced} disabled={addM.isPending || !tripId} onClick={() => addM.mutate()}>
          Добавить
        </button>
        {!tripId ? (
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>
            Для записи выберите открытый рейс.
          </p>
        ) : null}
      </div>

      {kind === "all" ? (
        <p className="birzha-ui-sm" style={{ marginTop: "1rem" }}>
          <Link to={sales.reports}>Отчёт по рейсу</Link> — нал, каждая трата и «к сдаче» по машине.
        </p>
      ) : null}

      {showMoneySends ? <SellerMoneySendsPanel /> : null}
    </div>
  );
}
