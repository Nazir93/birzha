import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse, closeTripById } from "../api/fetch-api.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import { formatBatchPartyCaption } from "../format/batch-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripListStatusLabel, formatTripReportStatusLabel, formatTripSelectLabel, tripListShowsSoldOut, tripReportShowsSoldOut } from "../format/trip-label.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import {
  aggregateSellerShipmentReports,
  clientSalePaymentLabelRu,
  tripLedgerMetrics,
} from "../format/seller-trip-metrics.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyleInline, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

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
  const queryClient = useQueryClient();
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

  const sellerTotals = useMemo(() => aggregateSellerShipmentReports(loadedReports), [loadedReports]);

  const tripRows = useMemo(() => {
    return selectedSellerTrips.map((t) => {
      const r = reportByTripId.get(t.id);
      if (!r) {
        return { trip: t, report: undefined as ShipmentReportResponse | undefined, metrics: null };
      }
      return { trip: t, report: r, metrics: tripLedgerMetrics(r) };
    });
  }, [reportByTripId, selectedSellerTrips]);

  const activeReport = activeTripId ? reportByTripId.get(activeTripId) ?? null : null;

  const closeTripSoldOutMut = useMutation({
    mutationFn: async (tripId: string) => {
      const rep = reportByTripId.get(tripId);
      if (!rep) {
        throw new Error("Нет отчёта по рейсу");
      }
      if (!tripReportShowsSoldOut(rep)) {
        const ok = window.confirm(
          "По отчёту ещё есть остаток в машине. Закрыть рейс всё равно? Обычно закрывают после полной продажи.",
        );
        if (!ok) {
          return;
        }
      }
      await closeTripById(tripId, "Нет прав: закрытие рейса — роли admin, manager, logistics");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      await queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    },
  });

  const sellerLabel = assignSellerUserId ? sellerLoginById.get(assignSellerUserId) ?? assignSellerUserId : "";

  return (
    <div className="birzha-assign-seller" role="region" aria-label="Продажи по продавцу">
      <header className="birzha-assign-seller__hero">
        <div>
          <h2 className="birzha-assign-seller__title">Продажи по продавцу</h2>
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
        <BirzhaEmptyState compact title="Выберите продавца" />
      ) : (
        <>
          <p className="birzha-assign-seller__seller-line">
            <strong>{sellerLabel}</strong>
            <span className="birzha-assign-seller__seller-meta">
              рейсов закреплено: {selectedSellerTrips.length}
            </span>
          </p>

          {reportLoading ? (
            <LoadingBlock label="Загрузка отчётов по рейсам…" minHeight={72} skeleton skeletonRows={5} />
          ) : null}
          {reportError ? (
            <p role="alert" className="birzha-assign-seller__alert">
              Не удалось загрузить часть отчётов. Обновите страницу.
            </p>
          ) : null}

          {!reportLoading && loadedReports.length > 0 ? (
            <BirzhaDisclosure
              nested
              defaultOpen
              title={<span style={{ fontWeight: 600 }}>Итого по продавцу</span>}
            >
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
                <span className="birzha-assign-seller__kpi-label">Остаток погруженного</span>
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
              <div className="birzha-assign-seller__kpi-card">
                <span className="birzha-assign-seller__kpi-label">Перевод (карта)</span>
                <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.cardTransfer.toString())} ₽</span>
              </div>
              <div className="birzha-assign-seller__kpi-card birzha-assign-seller__kpi-card--warn">
                <span className="birzha-assign-seller__kpi-label">В долг</span>
                <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.debt.toString())} ₽</span>
              </div>
              </section>
            </BirzhaDisclosure>
          ) : null}

          <BirzhaDisclosure
            nested
            defaultOpen
            title={
              <h3 id="assign-seller-trips-h" className="birzha-assign-seller__section-title" style={{ margin: 0 }}>
                Рейсы
              </h3>
            }
          >
            {selectedSellerTrips.length === 0 ? (
              <BirzhaEmptyState compact title="Нет закреплённых рейсов" />
            ) : (
              <div className="birzha-assign-seller__trip-table-wrap birzha-table-scroll birzha-table-scroll--sticky-head">
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
                        Погружено, кг
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Выручка
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Нал / карта / долг
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
                                  : tripListShowsSoldOut(t)
                                    ? "birzha-assign-seller__badge birzha-assign-seller__badge--soldout"
                                    : "birzha-assign-seller__badge birzha-assign-seller__badge--open"
                              }
                            >
                              {formatTripListStatusLabel(t)}
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
                              ? `${kopecksToRubLabel(r.sales.totalCashKopecks)} / ${kopecksToRubLabel(r.sales.totalCardTransferKopecks || "0")} / ${kopecksToRubLabel(r.sales.totalDebtKopecks)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </BirzhaDisclosure>

          {activeReport ? (
            <BirzhaDisclosure
              nested
              defaultOpen
              className="birzha-assign-seller__detail"
              title={
                <h3 className="birzha-assign-seller__detail-title" style={{ margin: 0 }}>
                  Рейс {activeReport.trip.tripNumber}
                  <span
                    className={
                      activeReport.trip.status === "closed"
                        ? "birzha-assign-seller__badge birzha-assign-seller__badge--closed"
                        : tripReportShowsSoldOut(activeReport)
                          ? "birzha-assign-seller__badge birzha-assign-seller__badge--soldout"
                          : "birzha-assign-seller__badge birzha-assign-seller__badge--open"
                    }
                  >
                    {formatTripReportStatusLabel(activeReport)}
                  </span>
                  {canCreateTrip(user ?? null) && activeReport.trip.status === "open" ? (
                    <button
                      type="button"
                      className="birzha-ui-sm no-print"
                      style={btnStyleInline}
                      disabled={closeTripSoldOutMut.isPending}
                      onClick={() => closeTripSoldOutMut.mutate(activeReport.trip.id)}
                    >
                      {closeTripSoldOutMut.isPending ? "…" : "Закрыть рейс"}
                    </button>
                  ) : null}
                </h3>
              }
            >
              {closeTripSoldOutMut.isError ? (
                <p className="birzha-text-danger birzha-ui-sm" role="alert" style={{ margin: "0 0 0.65rem" }}>
                  {(closeTripSoldOutMut.error as Error).message}
                </p>
              ) : null}
              <div className="birzha-assign-seller__detail-grid">
                <div className="birzha-assign-seller__detail-block">
                  <h4 className="birzha-assign-seller__detail-block-title">По партиям (накладная · калибр)</h4>
                  <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                    <table style={{ ...tableStyle, minWidth: 780 }} aria-label="Продажи по партиям">
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
                            Перевод (карта)
                          </th>
                          <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                            Долг
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeReport.sales.byBatch.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={thtd}>
                              Продаж по партиям нет.
                            </td>
                          </tr>
                        ) : (
                          activeReport.sales.byBatch.map((row) => {
                            const b = batchById.get(row.batchId);
                            const debtK = BigInt(row.debtKopecks || "0");
                            const cardK = BigInt(row.cardTransferKopecks || "0");
                            return (
                              <tr key={`${activeReport.trip.id}-${row.batchId}`}>
                                <td style={thtd}>{b?.nakladnaya?.productGradeCode ?? "—"}</td>
                                <td style={thtd} title={`id партии: ${row.batchId}`}>
                                  {formatBatchPartyCaption(b, row.batchId)}
                                </td>
                                <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(row.grams)}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.cashKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>
                                  {cardK > 0n ? `${kopecksToRubLabel(row.cardTransferKopecks)} ₽` : "—"}
                                </td>
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
                  <h4 className="birzha-assign-seller__detail-block-title">По клиентам (нал · карта · долг)</h4>
                  {activeReport.sales.byClient.length === 0 ? (
                    <BirzhaEmptyState
                      compact
                      title="Разбивки по клиентам нет"
                      description="Есть только сводные продажи по рейсу."
                    />
                  ) : (
                    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                      <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Продажи по клиентам">
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
                              Перевод (карта)
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
                            const cardK = BigInt(row.cardTransferKopecks || "0");
                            const label = row.clientLabel?.trim() || "—";
                            const payKind = clientSalePaymentLabelRu(cashK, debtK, cardK);
                            return (
                              <tr key={`${label}-${idx}`}>
                                <td style={thtd}>{label}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(row.grams)}</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(row.cashKopecks)} ₽</td>
                                <td style={{ ...thtd, textAlign: "right" }}>
                                  {cardK > 0n ? `${kopecksToRubLabel(row.cardTransferKopecks)} ₽` : "—"}
                                </td>
                                <td
                                  style={{
                                    ...thtd,
                                    textAlign: "right",
                                    fontWeight: debtK > 0n ? 600 : undefined,
                                  }}
                                >
                                  {debtK > 0n ? `${kopecksToRubLabel(row.debtKopecks)} ₽` : "—"}
                                </td>
                                <td className="birzha-ui-sm" style={thtd}>{payKind}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </BirzhaDisclosure>
          ) : assignSellerUserId && selectedSellerTrips.length > 0 && !reportLoading ? (
            <BirzhaEmptyState compact title="Нет данных отчёта" description="Для выбранного рейса отчёт не загрузился или пуст." />
          ) : null}
        </>
      )}
    </div>
  );
}
