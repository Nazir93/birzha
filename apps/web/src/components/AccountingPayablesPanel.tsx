import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { useAuth } from "../auth/auth-context.js";
import { canWriteAccounting } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import {
  accountingMonthBounds,
  readAccountingPeriodParams,
} from "../format/accounting-period.js";
import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

type PayableRow = {
  documentId: string;
  documentNumber: string;
  docDate: string;
  supplierId: string | null;
  supplierName: string | null;
  totalKopecks: string;
  paidKopecks: string;
  remainingKopecks: string;
  status: "open" | "closed";
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountingPayablesPanel() {
  const { user } = useAuth();
  const canWrite = canWriteAccounting(user);
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => accountingMonthBounds(), []);
  const initial = useMemo(() => readAccountingPeriodParams(searchParams, defaults), [searchParams, defaults]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [payDocId, setPayDocId] = useState<string | null>(null);
  const [amountRub, setAmountRub] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "bank">("cash");
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [comment, setComment] = useState("");

  const periodQ = useQuery({
    queryKey: ["accounting", "period-summary", from, to],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/period-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      await assertOkResponse(res);
      return (await res.json()) as {
        purchaseTotalKopecks: string;
        supplierPaidKopecks: string;
        payablesOutstandingKopecks: string;
        bySupplier?: {
          supplierKey: string;
          supplierName: string;
          purchaseTotalKopecks: string;
          paidKopecks: string;
          remainingKopecks: string;
        }[];
      };
    },
  });

  const listQ = useQuery({
    queryKey: ["accounting", "payables", status],
    queryFn: async () => {
      const res = await apiFetch(`/api/accounting/payables?status=${status}`);
      await assertOkResponse(res);
      return (await res.json()) as { payables: PayableRow[] };
    },
  });

  const payM = useMutation({
    mutationFn: async () => {
      if (!payDocId) {
        throw new Error("Не выбрана накладная");
      }
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму оплаты в рублях");
      }
      await apiPostJson(`/api/accounting/payables/${encodeURIComponent(payDocId)}/payments`, {
        amountKopecks: Math.round(rub * 100),
        method,
        paidAt,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setPayDocId(null);
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["accounting", "payables"] });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  const rows = listQ.data?.payables ?? [];

  return (
    <section aria-labelledby="acc-pay-h">
      <AccountingSectionBack />
      <h2 id="acc-pay-h" style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
        Тепличники
      </h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem", maxWidth: "40rem" }}>
        Сколько купили, сколько отдали, сколько ещё должны — и оплата по накладным.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.85rem", alignItems: "end" }}>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          С
          <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          По
          <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
        </label>
      </div>
      {periodQ.data ? (
        <div className="birzha-kpi-grid birzha-kpi-grid--wide" style={{ marginBottom: "1rem" }}>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Купили за период</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(periodQ.data.purchaseTotalKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium">
            <div className="birzha-kpi-tile__label">Отдали за период</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(periodQ.data.supplierPaidKopecks)}
            </div>
          </div>
          <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
            <div className="birzha-kpi-tile__label">Ещё должны</div>
            <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
              {kopecksToRubLabel(periodQ.data.payablesOutstandingKopecks)}
            </div>
          </div>
        </div>
      ) : null}
      {periodQ.data?.bySupplier && periodQ.data.bySupplier.length > 0 ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>По тепличникам за период</h3>
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
                {periodQ.data.bySupplier.map((row) => (
                  <tr key={row.supplierKey}>
                    <td style={thtd}>{row.supplierName}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.purchaseTotalKopecks)}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.paidKopecks)}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.remainingKopecks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {(["open", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={status === s ? "birzha-btn" : "birzha-clean-ops-text-btn"}
            onClick={() => setStatus(s)}
          >
            {s === "open" ? "Открытые" : s === "closed" ? "Закрытые" : "Все"}
          </button>
        ))}
        <button
          type="button"
          className="birzha-btn"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv("birzha-payables.csv", [
              ["Тепличник", "Накладная", "Дата", "Сумма", "Оплачено", "Остаток", "Статус"],
              ...rows.map((r) => [
                r.supplierName ?? "",
                r.documentNumber,
                r.docDate,
                kopecksToRubLabel(r.totalKopecks),
                kopecksToRubLabel(r.paidKopecks),
                kopecksToRubLabel(r.remainingKopecks),
                r.status,
              ]),
            ])
          }
        >
          CSV
        </button>
      </div>
      {listQ.isPending ? <LoadingBlock label="Загрузка кредиторки…" minHeight={64} skeleton skeletonRows={5} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Кредиторка" /> : null}
      {listQ.isSuccess && rows.length === 0 ? <BirzhaEmptyState compact title="Нет обязательств" /> : null}
      {rows.length > 0 ? (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
          <table style={{ ...tableStyle, minWidth: 800 }} aria-label="Кредиторка">
            <thead>
              <tr>
                <th style={thHead}>Тепличник</th>
                <th style={thHead}>Накладная</th>
                <th style={thHead}>Дата</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={{ ...thHead, textAlign: "right" }}>Оплачено</th>
                <th style={{ ...thHead, textAlign: "right" }}>Остаток</th>
                <th style={thHead} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.documentId}>
                  <td style={thtd}>{r.supplierName ?? "—"}</td>
                  <td style={thtd}>{r.documentNumber}</td>
                  <td style={thtd}>{r.docDate}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.totalKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.paidKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                    {kopecksToRubLabel(r.remainingKopecks)}
                  </td>
                  <td style={thtd}>
                    {canWrite && r.status === "open" ? (
                      <button type="button" className="birzha-clean-ops-text-btn" onClick={() => setPayDocId(r.documentId)}>
                        Оплата
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {payDocId && canWrite ? (
        <div className="birzha-callout-info" style={{ marginTop: "1rem", padding: "0.75rem" }}>
          <strong>Оплата тепличнику</strong>
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.5rem", maxWidth: "22rem" }}>
            <label className="birzha-form-label">
              Сумма, ₽
              <input style={fieldStyle} value={amountRub} onChange={(e) => setAmountRub(e.target.value)} />
            </label>
            <label className="birzha-form-label">
              Способ
              <select style={fieldStyle} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="bank">Банк</option>
              </select>
            </label>
            <label className="birzha-form-label">
              Дата
              <BirzhaDateField aria-label="Дата оплаты" value={paidAt} onChange={setPaidAt} style={dateFieldStyle} />
            </label>
            <label className="birzha-form-label">
              Комментарий
              <input style={fieldStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            {payM.isError ? <ErrorAlert error={payM.error} title="Оплата" /> : null}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className={btnClassSpaced} disabled={payM.isPending} onClick={() => payM.mutate()}>
                Провести
              </button>
              <button type="button" className="birzha-clean-ops-text-btn" onClick={() => setPayDocId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
