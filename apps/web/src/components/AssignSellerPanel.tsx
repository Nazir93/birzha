import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { formatBatchPartyCaption } from "../format/batch-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel, formatTripStatusLabel } from "../format/trip-label.js";
import { aggregateTripBatchRows, buildTripBatchRows } from "../format/trip-report-rows.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import {
  batchesFullListQueryOptions,
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { fieldStyle, muted, tableStyle, thHead, thtd } from "../ui/styles.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

function hasGlobalRole(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === role && r.scopeType === "global" && r.scopeId === "");
}

function tripMetrics(r: ShipmentReportResponse) {
  const agg = aggregateTripBatchRows(buildTripBatchRows(r));
  return {
    shippedKg: agg.shippedG,
    soldKg: agg.soldG,
    shortageKg: agg.shortageG,
    netTransitKg: agg.netTransitG,
    revenueK: agg.revenueK,
    cashK: agg.cashK,
    debtK: agg.debtK,
  };
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
  const [activeTripId, setActiveTripId] = useState("");

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
      setActiveTripId("");
      return;
    }
    if (!selectedSellerTrips.some((t) => t.id === activeTripId)) {
      setActiveTripId(selectedSellerTrips[0]!.id);
    }
  }, [activeTripId, selectedSellerTrips]);

  const reportQueries = useQueries({
    queries: selectedSellerTrips.map((trip) => ({
      ...shipmentReportQueryOptions(trip.id),
      enabled: Boolean(assignSellerUserId),
    })),
  });
  const reportLoading = reportQueries.some((q) => q.isPending);
  const reportError = reportQueries.find((q) => q.isError)?.error as Error | undefined;
  const loadedReports = reportQueries.map((q) => q.data).filter((x): x is ShipmentReportResponse => Boolean(x));

  const reportByTripId = useMemo(() => {
    const m = new Map<string, ShipmentReportResponse>();
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

  const sellerTotals = useMemo(() => {
    let shipped = 0n;
    let sold = 0n;
    let shortage = 0n;
    let netTransit = 0n;
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
      netTransit += tripMetrics(r).netTransitKg;
    }
    return { shipped, sold, shortage, netTransit, revenue, cash, debt };
  }, [loadedReports]);

  const tripRows = useMemo(() => {
    return selectedSellerTrips.map((t) => {
      const r = reportByTripId.get(t.id);
      if (!r) {
        return { trip: t, report: undefined as ShipmentReportResponse | undefined, metrics: null };
      }
      return { trip: t, report: r, metrics: tripMetrics(r) };
    });
  }, [reportByTripId, selectedSellerTrips]);

  const activeReport = activeTripId ? reportByTripId.get(activeTripId) ?? null : null;

  const sellerLabel = assignSellerUserId ? sellerLoginById.get(assignSellerUserId) ?? assignSellerUserId : "";

  return (
    <div className="birzha-assign-seller" role="region" aria-label="Продажи по продавцу">
      <header className="birzha-assign-seller__hero">
        <div>
          <h2 className="birzha-assign-seller__title">Продажи по продавцу</h2>
          <p className="birzha-assign-seller__lead">
            Сводка по закреплённым рейсам: масса, остаток в пути, выручка, наличные и продажи в долг по клиентам.
            Закрепление рейса — раздел «Отгрузка».
          </p>
        </div>
        <div className="birzha-assign-seller__pick">
          <label className="birzha-field-label" htmlFor="sales-seller">
            Продавец
          </label>
          {tripsQuery.isPending ? (
            <p className="birzha-assign-seller__pick-status" role="status">
              <LoadingIndicator size="sm" label="Загрузка…" />
            </p>
          ) : (
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
          )}
        </div>
      </header>

      {!assignSellerUserId ? (
        <p style={muted}>Выберите продавца.</p>
      ) : (
        <>
          <p className="birzha-assign-seller__seller-line">
            <strong>{sellerLabel}</strong>
            <span className="birzha-assign-seller__seller-meta">
              рейсов закреплено: {selectedSellerTrips.length}
            </span>
          </p>

          {reportLoading ? <LoadingBlock label="Загрузка отчётов по рейсам…" minHeight={72} /> : null}
          {reportError ? (
            <p role="alert" className="birzha-assign-seller__alert">
              Не удалось загрузить часть отчётов. Обновите страницу.
            </p>
          ) : null}

          {!reportLoading && loadedReports.length > 0 ? (
            <section className="birzha-assign-seller__kpi" aria-label="Итого по продавцу">
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Отгружено</span>
                <span className="birzha-assign-seller__kpi-value">{gramsToKgLabel(sellerTotals.shipped.toString())} кг</span>
              </div>
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Продано</span>
                <span className="birzha-assign-seller__kpi-value">{gramsToKgLabel(sellerTotals.sold.toString())} кг</span>
              </div>
              <div className="birzha-assign-seller__kpi-card birzha-assign-seller__kpi-card--accent">
                <span className="birzha-assign-seller__kpi-label">Остаток в пути</span>
                <span className="birzha-assign-seller__kpi-value">{gramsToKgLabel(sellerTotals.netTransit.toString())} кг</span>
              </div>
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Недостача</span>
                <span className="birzha-assign-seller__kpi-value">{gramsToKgLabel(sellerTotals.shortage.toString())} кг</span>
              </div>
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Выручка</span>
                <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.revenue.toString())} ₽</span>
              </div>
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Наличные</span>
                <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.cash.toString())} ₽</span>
              </div>
              <div className="birzha-assign-seller__kpi-card birzha-assign-seller__kpi-card--warn">
                <span className="birzha-assign-seller__kpi-label">В долг</span>
                <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.debt.toString())} ₽</span>
              </div>
            </section>
          ) : null}

          <section className="birzha-assign-seller__trips-section" aria-labelledby="assign-seller-trips-h">
            <h3 id="assign-seller-trips-h" className="birzha-assign-seller__section-title">
              Рейсы
            </h3>
            {selectedSellerTrips.length === 0 ? (
              <p style={{ ...muted, marginTop: 0 }}>Нет закреплённых рейсов — назначьте в «Отгрузка».</p>
            ) : (
              <div className="birzha-assign-seller__trip-table-wrap">
                <table className="birzha-assign-seller__trip-table" style={tableStyle}>
                  <thead>
                    <tr>
                      <th scope="col">Рейс</th>
                      <th scope="col">Статус</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Отгр., кг
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Прод., кг
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        В пути, кг
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Выручка
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Нал / долг
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripRows.map(({ trip: t, report: r, metrics: m }) => {
                      const active = t.id === activeTripId;
                      return (
                        <tr
                          key={t.id}
                          className={active ? "birzha-assign-seller__trip-row birzha-assign-seller__trip-row--active" : "birzha-assign-seller__trip-row"}
                        >
                          <td style={thtd}>
                            <button
                              type="button"
                              className="birzha-assign-seller__trip-select"
                              onClick={() => setActiveTripId(t.id)}
                            >
                              {formatTripSelectLabel(t)}
                            </button>
                          </td>
                          <td style={thtd}>
                            <span
                              className={
                                t.status === "closed"
                                  ? "birzha-assign-seller__badge birzha-assign-seller__badge--closed"
                                  : "birzha-assign-seller__badge birzha-assign-seller__badge--open"
                              }
                            >
                              {formatTripStatusLabel(t.status)}
                            </span>
                          </td>
                          <td style={{ ...thtd, textAlign: "right" }}>
                            {r && m ? gramsToKgLabel(m.shippedKg.toString()) : "—"}
                          </td>
                          <td style={{ ...thtd, textAlign: "right" }}>
                            {r && m ? gramsToKgLabel(m.soldKg.toString()) : "—"}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontWeight: m && m.netTransitKg > 0n ? 600 : undefined }}>
                            {r && m ? gramsToKgLabel(m.netTransitKg.toString()) : "—"}
                          </td>
                          <td style={{ ...thtd, textAlign: "right" }}>
                            {r ? `${kopecksToRubLabel(r.sales.totalRevenueKopecks)} ₽` : "—"}
                          </td>
                          <td style={{ ...thtd, textAlign: "right", fontSize: "0.86rem" }}>
                            {r
                              ? `${kopecksToRubLabel(r.sales.totalCashKopecks)} / ${kopecksToRubLabel(r.sales.totalDebtKopecks)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {activeReport ? (
            <section className="birzha-assign-seller__detail" aria-label="Детали выбранного рейса">
              <div className="birzha-assign-seller__detail-head">
                <h3 className="birzha-assign-seller__detail-title">
                  Рейс {activeReport.trip.tripNumber}
                  <span
                    className={
                      activeReport.trip.status === "closed"
                        ? "birzha-assign-seller__badge birzha-assign-seller__badge--closed"
                        : "birzha-assign-seller__badge birzha-assign-seller__badge--open"
                    }
                  >
                    {formatTripStatusLabel(activeReport.trip.status)}
                  </span>
                </h3>
                <p className="birzha-assign-seller__detail-note">
                  Наличные и долг — по данным продаж в этом рейсе. Отдельный учёт погашения долга после продажи в интерфейсе не
                  отображается.
                </p>
              </div>

              <div className="birzha-assign-seller__detail-grid">
                <div className="birzha-assign-seller__detail-block">
                  <h4 className="birzha-assign-seller__detail-block-title">По партиям (накладная · калибр)</h4>
                  <div className="birzha-table-scroll">
                    <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Продажи по партиям">
                      <thead>
                        <tr>
                          <th scope="col" style={thHead}>
                            Товар / калибр
                          </th>
                          <th scope="col" style={thHead}>
                            Партия
                          </th>
                          <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                            Продано, кг
                          </th>
                          <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                            Выручка
                          </th>
                          <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                            Наличные
                          </th>
                          <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                            Долг
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeReport.sales.byBatch.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={thtd}>
                              Продаж по партиям нет.
                            </td>
                          </tr>
                        ) : (
                          activeReport.sales.byBatch.map((row) => {
                            const b = batchById.get(row.batchId);
                            const debtK = BigInt(row.debtKopecks || "0");
                            return (
                              <tr key={`${activeReport.trip.id}-${row.batchId}`}>
                                <td style={thtd}>{b?.nakladnaya?.productGradeCode ?? "—"}</td>
                                <td style={thtd} title={`id партии: ${row.batchId}`}>
                                  {formatBatchPartyCaption(b, row.batchId)}
                                </td>
                                <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(row.grams)}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.cashKopecks)} ₽</td>
                                <td
                                  style={{
                                    ...thtd,
                                    textAlign: "right",
                                    fontWeight: debtK > 0n ? 600 : undefined,
                                    color: debtK > 0n ? "var(--birzha-danger, #b91c1c)" : undefined,
                                  }}
                                >
                                  {debtK > 0n ? `${kopecksToRubLabel(row.debtKopecks)} ₽` : "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="birzha-assign-seller__detail-block">
                  <h4 className="birzha-assign-seller__detail-block-title">По клиентам (наличные / долг)</h4>
                  {activeReport.sales.byClient.length === 0 ? (
                    <p style={{ ...muted, margin: 0 }}>Разбивки по клиентам нет — только сводные продажи.</p>
                  ) : (
                    <div className="birzha-table-scroll">
                      <table style={{ ...tableStyle, minWidth: 640 }} aria-label="Продажи по клиентам">
                        <thead>
                          <tr>
                            <th scope="col" style={thHead}>
                              Клиент / метка
                            </th>
                            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                              Кг
                            </th>
                            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                              Выручка
                            </th>
                            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                              Наличные
                            </th>
                            <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                              Долг
                            </th>
                            <th scope="col" style={thHead}>
                              Форма оплаты
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeReport.sales.byClient.map((row, idx) => {
                            const debtK = BigInt(row.debtKopecks || "0");
                            const cashK = BigInt(row.cashKopecks || "0");
                            const label = row.clientLabel?.trim() || "—";
                            let payKind = "Смешанно";
                            if (debtK === 0n && cashK > 0n) {
                              payKind = "Наличные";
                            } else if (cashK === 0n && debtK > 0n) {
                              payKind = "В долг";
                            } else if (cashK === 0n && debtK === 0n) {
                              payKind = "—";
                            }
                            return (
                              <tr key={`${label}-${idx}`}>
                                <td style={thtd}>{label}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(row.grams)}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.cashKopecks)} ₽</td>
                                <td
                                  style={{
                                    ...thtd,
                                    textAlign: "right",
                                    fontWeight: debtK > 0n ? 600 : undefined,
                                  }}
                                >
                                  {debtK > 0n ? `${kopecksToRubLabel(row.debtKopecks)} ₽` : "—"}
                                </td>
                                <td style={{ ...thtd, fontSize: "0.88rem" }}>{payKind}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : assignSellerUserId && selectedSellerTrips.length > 0 && !reportLoading ? (
            <p style={muted}>Нет данных отчёта для выбранного рейса.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
