import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { filterTripsAssignedToSellerForReports, isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import { accountingMonthBounds, readAccountingPeriodParams } from "../format/accounting-period.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

type SendRow = {
  id: string;
  tripId: string | null;
  sendDate: string;
  amountKopecks: string;
  recipient: string;
  comment: string | null;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SellerMoneySendsPanel({ compact = false }: { compact?: boolean } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fieldOnly = Boolean(user && isFieldSellerOnly(user));
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => accountingMonthBounds(), []);
  const initial = useMemo(() => readAccountingPeriodParams(searchParams, defaults), [searchParams, defaults]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tripId, setTripId] = useState("");
  const [sendDate, setSendDate] = useState(todayYmd);
  const [recipient, setRecipient] = useState("");
  const [amountRub, setAmountRub] = useState("");
  const [comment, setComment] = useState("");

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const tripsForSelect = useMemo(() => {
    const all = tripsQ.data?.trips ?? [];
    const open = all.filter((t) => isTripOpenForSellerWorkspace(t));
    return fieldOnly && user ? filterTripsAssignedToSellerForReports(open, user.id) : open;
  }, [tripsQ.data?.trips, fieldOnly, user]);

  const listQ = useQuery({
    queryKey: ["seller-money-sends", from, to, tripId],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("from", from);
      p.set("to", to);
      if (tripId) {
        p.set("tripId", tripId);
      }
      const res = await apiFetch(`/api/seller-money-sends?${p}`);
      await assertOkResponse(res);
      return (await res.json()) as { totalKopecks: string; sends: SendRow[] };
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      const rub = Number(amountRub.replace(",", "."));
      if (!Number.isFinite(rub) || rub <= 0) {
        throw new Error("Введите сумму в рублях");
      }
      if (!recipient.trim()) {
        throw new Error("Укажите, кому отправили деньги");
      }
      await apiPostJson("/api/seller-money-sends", {
        amountKopecks: Math.round(rub * 100),
        sendDate,
        recipient: recipient.trim(),
        tripId: tripId || undefined,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setAmountRub("");
      setComment("");
      await qc.invalidateQueries({ queryKey: ["seller-money-sends"] });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  return (
    <div style={{ marginTop: compact ? 0 : "1.75rem" }}>
      <h3 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Отправка денег</h3>
      <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.75rem", maxWidth: "40rem" }}>
        Сколько отправили, кому и когда. Суммы попадают в сводку бухгалтерии для контроля.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "end" }}>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          С
          <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          По
          <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "12rem" }}>
          Рейс (необязательно)
          <BirzhaSelect
            aria-label="Рейс"
            style={fieldStyle}
            value={tripId}
            onChange={setTripId}
            options={[
              { value: "", label: "Все / без рейса" },
              ...tripsForSelect.map((t) => ({ value: t.id, label: formatTripSelectLabel(t) })),
            ]}
          />
        </label>
      </div>

      {listQ.isPending ? <LoadingBlock label="Отправки…" minHeight={40} skeleton skeletonRows={2} /> : null}
      {listQ.isError ? <ErrorAlert error={listQ.error} title="Отправка денег" /> : null}
      {listQ.data ? (
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Отправлено за период: <strong>{kopecksToRubLabel(listQ.data.totalKopecks)} ₽</strong>
        </p>
      ) : null}

      <div style={{ display: "grid", gap: "0.45rem", marginBottom: "1rem", maxWidth: "22rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>Новая отправка</strong>
        <label className="birzha-form-label">
          Дата
          <BirzhaDateField aria-label="Дата отправки" value={sendDate} onChange={setSendDate} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label">
          Кому
          <input
            style={fieldStyle}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="ФИО или офис"
            required
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
        {addM.isError ? <ErrorAlert error={addM.error} title="Отправка" /> : null}
        <button type="button" className={btnClassSpaced} disabled={addM.isPending} onClick={() => addM.mutate()}>
          Записать отправку
        </button>
      </div>

      {listQ.data?.sends.length === 0 ? <BirzhaEmptyState compact title="Отправок за период нет" /> : null}
      {listQ.data && listQ.data.sends.length > 0 ? (
        <div className="birzha-table-scroll">
          <table style={{ ...tableStyle, minWidth: 520 }} aria-label="Отправки денег">
            <thead>
              <tr>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Кому</th>
                <th style={{ ...thHead, textAlign: "right" }}>Сумма</th>
                <th style={thHead}>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.sends.map((s) => (
                <tr key={s.id}>
                  <td style={thtd}>{s.sendDate}</td>
                  <td style={thtd}>{s.recipient}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(s.amountKopecks)}</td>
                  <td style={thtd}>{s.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
