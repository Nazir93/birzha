import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { BatchListItem } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { formatBatchPartyCaption } from "../format/batch-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripStatusLabel } from "../format/trip-label.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import {
  batchesFullListQueryOptions,
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { btnStyle, fieldStyle, muted, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

function hasGlobalRole(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === role && r.scopeType === "global" && r.scopeId === "");
}

export function AssignSellerPanel() {
  const { meta, user } = useAuth();
  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const batchesQuery = useQuery(batchesFullListQueryOptions());
  const fieldSellersQuery = useQuery(tripsFieldSellerOptionsQueryOptions());
  const canManageUsers = hasGlobalRole(user, "admin") || hasGlobalRole(user, "manager");
  const showAdminUsersApi = meta?.adminUsersApi === "enabled" && user != null;

  const sellerUsersQuery = useQuery({
    queryKey: ["admin-users", "sellers-only"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/users");
      await assertOkResponse(res, "GET /api/admin/users");
      const data = (await res.json()) as { users: AdminUserRow[] };
      return data.users.filter((x) => x.roleCodes.includes("seller"));
    },
    enabled: canManageUsers && showAdminUsersApi,
  });

  const tripSelectOptions = useMemo(
    () => sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );
  const sellerLoginById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sellerUsersQuery.data ?? []) {
      m.set(s.id, s.login);
    }
    for (const s of fieldSellersQuery.data?.fieldSellers ?? []) {
      m.set(s.id, s.login);
    }
    for (const t of tripSelectOptions) {
      if (t.assignedSellerUserId && !m.has(t.assignedSellerUserId)) {
        m.set(t.assignedSellerUserId, t.assignedSellerUserId);
      }
    }
    return m;
  }, [fieldSellersQuery.data?.fieldSellers, sellerUsersQuery.data, tripSelectOptions]);

  const sellerOptions = useMemo(() => {
    return [...sellerLoginById.entries()]
      .map(([id, login]) => ({ id, login }))
      .sort((a, b) => a.login.localeCompare(b.login, "ru"));
  }, [sellerLoginById]);

  const [assignSellerUserId, setAssignSellerUserId] = useState("");
  const [detailTripId, setDetailTripId] = useState("");

  useEffect(() => {
    if (!assignSellerUserId && sellerOptions.length > 0) {
      setAssignSellerUserId(sellerOptions[0]!.id);
    }
  }, [assignSellerUserId, sellerOptions]);

  const selectedSellerTrips = useMemo(
    () => tripSelectOptions.filter((t) => t.assignedSellerUserId === assignSellerUserId),
    [assignSellerUserId, tripSelectOptions],
  );

  useEffect(() => {
    if (selectedSellerTrips.length === 0) {
      setDetailTripId("");
      return;
    }
    if (!selectedSellerTrips.some((t) => t.id === detailTripId)) {
      setDetailTripId(selectedSellerTrips[0]!.id);
    }
  }, [detailTripId, selectedSellerTrips]);

  const reportQueries = useQueries({
    queries: selectedSellerTrips.map((trip) => ({
      ...shipmentReportQueryOptions(trip.id),
      enabled: Boolean(assignSellerUserId),
    })),
  });
  const reportLoading = reportQueries.some((q) => q.isPending);
  const reportError = reportQueries.find((q) => q.isError)?.error as Error | undefined;
  const loadedReports = reportQueries.map((q) => q.data).filter((x): x is NonNullable<typeof x> => Boolean(x));

  const totals = useMemo(() => {
    let shipped = 0n;
    let sold = 0n;
    let shortage = 0n;
    let revenue = 0n;
    let cash = 0n;
    let debt = 0n;
    for (const r of loadedReports) {
      shipped += BigInt(r.shipment.totalGrams);
      sold += BigInt(r.sales.totalGrams);
      shortage += BigInt(r.shortage.totalGrams);
      revenue += BigInt(r.sales.totalRevenueKopecks);
      cash += BigInt(r.sales.totalCashKopecks);
      debt += BigInt(r.sales.totalDebtKopecks);
    }
    return { shipped, sold, shortage, revenue, cash, debt };
  }, [loadedReports]);

  const reportByTripId = useMemo(() => {
    const m = new Map<string, (typeof loadedReports)[number]>();
    for (const r of loadedReports) {
      m.set(r.trip.id, r);
    }
    return m;
  }, [loadedReports]);
  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);
  const detailReport = detailTripId ? reportByTripId.get(detailTripId) ?? null : null;

  return (
    <div role="region" aria-label="Продажи">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Продажи</h2>
      <p style={{ ...muted, margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
        Сводки по выручке, налу и долгу по продавцу и рейсам. Закрепление рейса за продавцом — в разделе «Отгрузка».
      </p>

      <section className="birzha-panel" aria-labelledby="sales-sec-seller">
        <div className="birzha-section-heading">
          <div>
            <h3 id="sales-sec-seller" className="birzha-section-title birzha-section-title--sm">
              Продавец
            </h3>
          </div>
          <p className="birzha-section-heading__note">Выберите продавца для сводки</p>
        </div>
        <label htmlFor="sales-seller" style={{ fontSize: "0.88rem", display: "block" }}>
          Продавец
        </label>
        {tripsQuery.isPending ? (
          <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
            <LoadingIndicator size="sm" label="Загрузка рейсов…" />
          </p>
        ) : null}
        <select
          id="sales-seller"
          value={assignSellerUserId}
          onChange={(e) => setAssignSellerUserId(e.target.value)}
          style={selectWide}
          disabled={sellerOptions.length === 0}
        >
          <option value="">{sellerOptions.length === 0 ? "— нет продавцов —" : "— выберите продавца —"}</option>
          {sellerOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.login}
            </option>
          ))}
        </select>
      </section>

      <section className="birzha-panel" aria-labelledby="sales-sec-sales">
        <div className="birzha-section-heading">
          <div>
            <h3 id="sales-sec-sales" className="birzha-section-title birzha-section-title--sm">
              Продажи по продавцу
            </h3>
          </div>
          <p className="birzha-section-heading__note">Полная сводка: отгрузка, продажа, выручка, нал и долг</p>
        </div>
        {!assignSellerUserId ? (
          <p style={muted}>Выберите продавца выше.</p>
        ) : (
          <>
            <p style={{ ...muted, marginTop: 0 }}>
              Продавец: <strong>{sellerLoginById.get(assignSellerUserId) ?? assignSellerUserId}</strong> · рейсов:{" "}
              {selectedSellerTrips.length}
            </p>
            {reportLoading ? <LoadingBlock label="Сбор полной сводки по рейсам продавца…" minHeight={70} /> : null}
            {reportError ? (
              <p role="alert" style={warnText}>
                Не удалось загрузить часть отчётов по рейсам.
              </p>
            ) : null}
            <div className="birzha-table-scroll">
              <table style={{ ...tableStyle, minWidth: 760 }} aria-label="Итоги продавца">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Отгружено, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Продано, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Недостача, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Выручка
                    </th>
                    <th scope="col" style={thHead}>
                      Нал
                    </th>
                    <th scope="col" style={thHead}>
                      Долг
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={thtd}>{gramsToKgLabel(totals.shipped.toString())}</td>
                    <td style={thtd}>{gramsToKgLabel(totals.sold.toString())}</td>
                    <td style={thtd}>{gramsToKgLabel(totals.shortage.toString())}</td>
                    <td style={thtd}>{kopecksToRubLabel(totals.revenue.toString())} ₽</td>
                    <td style={thtd}>{kopecksToRubLabel(totals.cash.toString())} ₽</td>
                    <td style={thtd}>{kopecksToRubLabel(totals.debt.toString())} ₽</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="birzha-table-scroll" style={{ marginTop: "0.7rem" }}>
              <table style={{ ...tableStyle, minWidth: 900 }} aria-label="Рейсы продавца">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Рейс
                    </th>
                    <th scope="col" style={thHead}>
                      Статус
                    </th>
                    <th scope="col" style={thHead}>
                      Продано, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Выручка
                    </th>
                    <th scope="col" style={thHead}>
                      Нал / долг
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSellerTrips.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={thtd}>
                        У этого продавца пока нет закреплённых рейсов (назначение — в «Отгрузка»).
                      </td>
                    </tr>
                  ) : (
                    selectedSellerTrips.map((t) => {
                      const r = reportByTripId.get(t.id);
                      return (
                        <tr key={t.id}>
                          <td style={thtd}>
                            <button
                              type="button"
                              style={{ ...btnStyle, padding: "0.25rem 0.55rem" }}
                              onClick={() => setDetailTripId(t.id)}
                            >
                              {t.tripNumber}
                            </button>
                          </td>
                          <td style={thtd}>{formatTripStatusLabel(t.status)}</td>
                          <td style={thtd}>{r ? gramsToKgLabel(r.sales.totalGrams) : "—"}</td>
                          <td style={thtd}>{r ? `${kopecksToRubLabel(r.sales.totalRevenueKopecks)} ₽` : "—"}</td>
                          <td style={thtd}>
                            {r
                              ? `${kopecksToRubLabel(r.sales.totalCashKopecks)} / ${kopecksToRubLabel(r.sales.totalDebtKopecks)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {detailReport ? (
              <div className="birzha-table-scroll" style={{ marginTop: "0.7rem" }}>
                <table style={{ ...tableStyle, minWidth: 980 }} aria-label="Детали продаж по партиям">
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        Рейс
                      </th>
                      <th scope="col" style={thHead}>
                        Товар/калибр
                      </th>
                      <th scope="col" style={thHead}>
                        Партия
                      </th>
                      <th scope="col" style={thHead}>
                        Продано, кг
                      </th>
                      <th scope="col" style={thHead}>
                        Выручка
                      </th>
                      <th scope="col" style={thHead}>
                        Нал / долг
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailReport.sales.byBatch.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={thtd}>
                          По выбранному рейсу продаж нет.
                        </td>
                      </tr>
                    ) : (
                      detailReport.sales.byBatch.map((row) => {
                        const b = batchById.get(row.batchId);
                        return (
                          <tr key={`${detailReport.trip.id}-${row.batchId}`}>
                            <td style={thtd}>{detailReport.trip.tripNumber}</td>
                            <td style={thtd}>{b?.nakladnaya?.productGradeCode ?? "—"}</td>
                            <td style={thtd} title={`Технический id партии: ${row.batchId}`}>
                              {formatBatchPartyCaption(b, row.batchId)}
                            </td>
                            <td style={thtd}>{gramsToKgLabel(row.grams)}</td>
                            <td style={thtd}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                            <td style={thtd}>
                              {kopecksToRubLabel(row.cashKopecks)} / {kopecksToRubLabel(row.debtKopecks)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
