import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiPostJson } from "../api/fetch-api.js";
import type { TripDebtReceivableRow } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { canRecordReceivablePayment } from "../auth/role-panels.js";
import { rubStringToPaymentKopecks } from "../format/debt-payment-rub.js";
import { kopecksToRubLabel } from "../format/money.js";
import { queryRoots } from "../query/core-list-queries.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Долги по сделкам рейса: остаток и приём оплаты (админ / продавец / бухгалтер).
 */
export function TripDebtReceivablesSection({
  receivables,
  compact = false,
}: {
  receivables: TripDebtReceivableRow[];
  compact?: boolean;
}) {
  const { user } = useAuth();
  const canPay = canRecordReceivablePayment(user);
  const qc = useQueryClient();
  const [paySaleId, setPaySaleId] = useState<string | null>(null);
  const [amountRub, setAmountRub] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "bank">("cash");
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [comment, setComment] = useState("");

  const openRows = useMemo(() => receivables.filter((r) => r.status === "open"), [receivables]);
  const closedRows = useMemo(() => receivables.filter((r) => r.status === "closed"), [receivables]);
  const selected = useMemo(
    () => (paySaleId ? receivables.find((r) => r.saleId === paySaleId) ?? null : null),
    [paySaleId, receivables],
  );

  const payM = useMutation({
    mutationFn: async () => {
      if (!paySaleId) {
        throw new Error("Не выбрана сделка");
      }
      const amountKopecks = rubStringToPaymentKopecks(amountRub);
      if (selected) {
        const remaining = BigInt(selected.remainingKopecks || "0");
        if (BigInt(amountKopecks) > remaining) {
          throw new Error(`Сумма больше остатка долга (${kopecksToRubLabel(selected.remainingKopecks)} ₽)`);
        }
      }
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
      await qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      await qc.invalidateQueries({ queryKey: ["accounting", "receivables"] });
    },
  });

  if (receivables.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="trip-debt-recv-h" style={{ marginTop: compact ? "0.75rem" : "1rem" }}>
      <h3 id="trip-debt-recv-h" className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
        Долги по рейсу
      </h3>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.65rem", maxWidth: "40rem", lineHeight: 1.45 }}>
        Продажи в долг и погашения. После оплаты остаток обновляется в отчёте и в дебиторке.
      </p>
      {openRows.length === 0 && closedRows.length > 0 ? (
        <BirzhaEmptyState compact title="Открытых долгов нет — все погашены" />
      ) : null}
      {openRows.length > 0 ? (
        <div className="birzha-table-scroll" style={{ marginBottom: "0.75rem" }}>
          <table style={{ ...tableStyle, minWidth: compact ? 420 : 560 }} aria-label="Открытые долги по рейсу">
            <thead>
              <tr>
                <th style={thHead}>Клиент</th>
                <th style={{ ...thHead, textAlign: "right" }}>Долг</th>
                <th style={{ ...thHead, textAlign: "right" }}>Оплачено</th>
                <th style={{ ...thHead, textAlign: "right" }}>Остаток</th>
                {canPay ? <th style={thHead} /> : null}
              </tr>
            </thead>
            <tbody>
              {openRows.map((r) => (
                <tr key={r.saleId}>
                  <td style={thtd}>{r.clientLabel?.trim() || "Без клиента"}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.debtKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.paidKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                    {kopecksToRubLabel(r.remainingKopecks)}
                  </td>
                  {canPay ? (
                    <td style={thtd}>
                      <button
                        type="button"
                        className="birzha-clean-ops-text-btn"
                        onClick={() => {
                          setPaySaleId(r.saleId);
                          setAmountRub(kopecksToRubLabel(r.remainingKopecks).replace(/\s/g, "").replace(",", "."));
                          setPaidAt(todayYmd());
                          setComment("");
                          setMethod("cash");
                        }}
                      >
                        Принять оплату
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {closedRows.length > 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.65rem" }}>
          Закрыто сделок: {closedRows.length}
          {closedRows.slice(0, 3).map((r) => (
            <span key={r.saleId}>
              {" · "}
              {r.clientLabel?.trim() || "Без клиента"} ({kopecksToRubLabel(r.debtKopecks)} ₽)
            </span>
          ))}
          {closedRows.length > 3 ? "…" : null}
        </p>
      ) : null}
      {paySaleId && canPay && selected ? (
        <div className="birzha-callout-info" style={{ padding: "0.75rem", marginBottom: "0.5rem" }}>
          <strong>
            Оплата: {selected.clientLabel?.trim() || "Без клиента"} — остаток{" "}
            {kopecksToRubLabel(selected.remainingKopecks)} ₽
          </strong>
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.5rem", maxWidth: "22rem" }}>
            <label className="birzha-form-label">
              Сумма, ₽
              <input
                style={fieldStyle}
                value={amountRub}
                onChange={(e) => setAmountRub(e.target.value)}
                inputMode="decimal"
                aria-label="Сумма оплаты долга"
              />
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
              <BirzhaDateField aria-label="Дата оплаты долга" value={paidAt} onChange={setPaidAt} style={dateFieldStyle} />
            </label>
            <label className="birzha-form-label">
              Комментарий
              <input style={fieldStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            {payM.isError ? <ErrorAlert error={payM.error} title="Оплата долга" /> : null}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={btnClassSpaced}
                disabled={payM.isPending}
                aria-busy={payM.isPending ? true : undefined}
                onClick={() => payM.mutate()}
              >
                {payM.isPending ? "Проведение…" : "Провести оплату"}
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
