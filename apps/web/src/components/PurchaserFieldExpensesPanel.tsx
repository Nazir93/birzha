import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { formatLoadingManifestDisplayName } from "../format/loading-manifest.js";
import { kopecksToRubLabel } from "../format/money.js";
import { loadingManifestsPagedQueryOptions, queryRoots } from "../query/core-list-queries.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const CATEGORY_LABEL: Record<string, string> = {
  loading: "Погрузка",
  lunch: "Обед",
  foam: "Пенопласт",
  fuel: "Заправка",
  other: "Прочее",
  salary: "Зарплата",
};

type ExpenseCategory = "loading" | "lunch" | "foam" | "fuel" | "other";

type ExpenseRow = {
  id: string;
  category: string;
  amountKopecks: string;
  expenseDate: string;
  loadingManifestId: string | null;
  purchaserLabel: string | null;
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
 * Расходы закупщика на погрузочную накладную: погрузка, обед, пенопласт, заправка, прочее.
 */
export function PurchaserFieldExpensesPanel() {
  const qc = useQueryClient();
  const defaults = useMemo(() => monthBounds(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [category, setCategory] = useState<ExpenseCategory>("loading");
  const [amountRub, setAmountRub] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadingManifestId, setLoadingManifestId] = useState("");
  const [comment, setComment] = useState("");

  const manifestsQ = useQuery(loadingManifestsPagedQueryOptions({ limit: 200, offset: 0 }));

  const listQ = useQuery({
    queryKey: ["accounting", "purchaser-expenses", "field", from, to],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/purchaser-expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      await assertOkResponse(res);
      return (await res.json()) as {
        totalKopecks: string;
        expenses: ExpenseRow[];
      };
    },
  });

  const manifestLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of manifestsQ.data?.loadingManifests ?? []) {
      map.set(m.id, formatLoadingManifestDisplayName(m));
    }
    return map;
  }, [manifestsQ.data?.loadingManifests]);

  const addM = useMutation({
    mutationFn: async () => {
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму расхода в рублях");
      }
      if (!loadingManifestId.trim()) {
        throw new Error("Выберите погрузочную накладную");
      }
      await apiPostJson("/api/accounting/purchaser-expenses", {
        category,
        amountKopecks: Math.round(rub * 100),
        expenseDate,
        loadingManifestId: loadingManifestId.trim(),
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["accounting", "purchaser-expenses"] });
      await qc.invalidateQueries({ queryKey: queryRoots.loadingManifest });
      await qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  return (
    <div>
      <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: 0, maxWidth: "42rem" }}>
        Расходы на погрузку, обед, пенопласт, заправку и прочее — привязываются к погрузочной накладной и видны в
        бухгалтерии.
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

      {listQ.isPending ? <LoadingBlock label="Расходы…" minHeight={48} skeleton skeletonRows={2} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Расходы закупщика" /> : null}
      {listQ.data ? (
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Итого за период: <strong>{kopecksToRubLabel(listQ.data.totalKopecks)} ₽</strong>
        </p>
      ) : null}

      <form
        className="birzha-form-grid"
        style={{ marginBottom: "1rem", maxWidth: "40rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          addM.mutate();
        }}
      >
        <label className="birzha-form-label" style={{ gridColumn: "1 / -1" }}>
          Погрузочная накладная *
          <BirzhaSelect
            aria-label="Погрузочная накладная"
            value={loadingManifestId}
            onChange={setLoadingManifestId}
            style={fieldStyle}
            placeholder="— выберите ПН —"
            options={[
              { value: "", label: "— выберите ПН —" },
              ...(manifestsQ.data?.loadingManifests ?? []).map((m) => ({
                value: m.id,
                label: formatLoadingManifestDisplayName(m),
              })),
            ]}
          />
        </label>
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
          <BirzhaSelect
            aria-label="Категория"
            value={category}
            onChange={(v) => setCategory(v as ExpenseCategory)}
            style={fieldStyle}
            options={[
              { value: "loading", label: "Погрузка" },
              { value: "lunch", label: "Обед" },
              { value: "foam", label: "Пенопласт" },
              { value: "fuel", label: "Заправка" },
              { value: "other", label: "Прочее" },
            ]}
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

      {listQ.data && listQ.data.expenses.length > 0 ? (
        <div className="birzha-table-scroll">
          <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Расходы закупщика">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>ПН</th>
                <th style={thHead}>Категория</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.expenses.map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{e.expenseDate}</td>
                  <td style={thtd}>
                    {e.loadingManifestId
                      ? (manifestLabel.get(e.loadingManifestId) ?? e.loadingManifestId.slice(0, 8))
                      : "—"}
                  </td>
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
