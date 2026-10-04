import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { AccountingSectionBack } from "./AccountingSectionBack.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { useAuth } from "../auth/auth-context.js";
import { canWriteAccounting } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

type ReceivableRow = {
  saleId: string;
  tripId: string;
  tripNumber: string;
  counterpartyId: string | null;
  clientLabel: string | null;
  debtKopecks: string;
  paidKopecks: string;
  remainingKopecks: string;
  status: "open" | "closed";
  soldAt: string;
  daysSinceSale: number;
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

export function AccountingReceivablesPanel() {
  const { user } = useAuth();
  const canWrite = canWriteAccounting(user);
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [paySaleId, setPaySaleId] = useState<string | null>(null);
  const [amountRub, setAmountRub] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "bank">("cash");
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [comment, setComment] = useState("");

  const listQ = useQuery({
    queryKey: ["accounting", "receivables", status],
    queryFn: async () => {
      const res = await apiFetch(`/api/accounting/receivables?status=${status}`);
      await assertOkResponse(res);
      return (await res.json()) as { receivables: ReceivableRow[] };
    },
  });

  const payM = useMutation({
    mutationFn: async () => {
      if (!paySaleId) {
        throw new Error("Не выбрана сделка");
      }
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму оплаты в рублях");
      }
      const amountKopecks = Math.round(rub * 100);
      await apiPostJson(`/api/accounting/receivables/${encodeURIComponent(paySaleId)}/payments`, {
        amountKopecks,
        method,
        paidAt,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setPaySaleId(null);
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["accounting", "receivables"] });
    },
  });

  const grouped = useMemo(() => {
    const rows = listQ.data?.receivables ?? [];
    const m = new Map<string, ReceivableRow[]>();
    for (const r of rows) {
      const key = (r.clientLabel?.trim() || "Без клиента") + "::" + (r.counterpartyId ?? "");
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return [...m.entries()].map(([key, items]) => ({
      key,
      label: items[0]?.clientLabel?.trim() || "Без клиента",
      items,
      remaining: items.reduce((a, x) => a + BigInt(x.remainingKopecks), 0n),
    }));
  }, [listQ.data]);

  return (
    <section aria-labelledby="acc-recv-h">
      <AccountingSectionBack />
      <h2 id="acc-recv-h" style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
        Дебиторка клиентов
      </h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem", maxWidth: "40rem" }}>
        Долг по продажам с рейса. Оплату проводит бухгалтер или руководитель.
      </p>
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
          disabled={!listQ.data?.receivables.length}
          onClick={() => {
            const rows = listQ.data?.receivables ?? [];
            downloadCsv("birzha-receivables.csv", [
              ["Клиент", "Рейс", "Долг", "Оплачено", "Остаток", "Статус", "Дней"],
              ...rows.map((r) => [
                r.clientLabel ?? "",
                r.tripNumber,
                kopecksToRubLabel(r.debtKopecks),
                kopecksToRubLabel(r.paidKopecks),
                kopecksToRubLabel(r.remainingKopecks),
                r.status,
                String(r.daysSinceSale),
              ]),
            ]);
          }}
        >
          CSV
        </button>
      </div>
      {listQ.isPending ? <LoadingBlock label="Загрузка дебиторки…" minHeight={64} skeleton skeletonRows={5} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Дебиторка" /> : null}
      {listQ.isSuccess && grouped.length === 0 ? <BirzhaEmptyState compact title="Нет долгов" /> : null}
      {grouped.map((g) => (
        <BirzhaDisclosure
          key={g.key}
          nested
          defaultOpen
          title={
            <span>
              <strong>{g.label}</strong>{" "}
              <span className="birzha-text-muted birzha-ui-sm">
                остаток {kopecksToRubLabel(g.remaining.toString())} ₽ · {g.items.length} сдел.
              </span>
            </span>
          }
        >
          <div className="birzha-table-scroll">
            <table style={{ ...tableStyle, minWidth: 720 }} aria-label={`Долги ${g.label}`}>
              <thead>
                <tr>
                  <th style={thHead}>Рейс</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Долг</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Оплачено</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Остаток</th>
                  <th style={thHead}>Дней</th>
                  <th style={thHead} />
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => (
                  <tr key={r.saleId}>
                    <td style={thtd}>{r.tripNumber}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.debtKopecks)}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.paidKopecks)}</td>
                    <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                      {kopecksToRubLabel(r.remainingKopecks)}
                    </td>
                    <td style={thtd}>{r.daysSinceSale}</td>
                    <td style={thtd}>
                      {canWrite && r.status === "open" ? (
                        <button type="button" className="birzha-clean-ops-text-btn" onClick={() => setPaySaleId(r.saleId)}>
                          Оплата
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BirzhaDisclosure>
      ))}
      {paySaleId && canWrite ? (
        <div className="birzha-callout-info" style={{ marginTop: "1rem", padding: "0.75rem" }}>
          <strong>Принять оплату</strong>
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
              <button type="button" className="birzha-clean-ops-text-btn" onClick={() => setPaySaleId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
