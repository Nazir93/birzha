import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { ShipmentReportResponse } from "../api/types.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { aggregateSellerShipmentReports, tripLedgerMetrics } from "../format/seller-trip-metrics.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import {
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { useAuth } from "../auth/auth-context.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { fieldStyle, tableStyle, thtd } from "../ui/styles.js";

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

function hasGlobalRole(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === role && r.scopeType === "global" && r.scopeId === "");
}

function tripInDateRange(departedAt: string | null | undefined, from: string, to: string): boolean {
  if (!from.trim() && !to.trim()) {
    return true;
  }
  if (!departedAt) {
    return false;
  }
  const d = new Date(departedAt);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  const day = d.toISOString().slice(0, 10);
  if (from.trim() && day < from.trim()) {
    return false;
  }
  if (to.trim() && day > to.trim()) {
    return false;
  }
  return true;
}

export function AdminSoldBySellerPage() {
  const { meta, user } = useAuth();
  const tripsQuery = useQuery(tripsFullListQueryOptions());
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

  const [sellerSearch, setSellerSearch] = useState("");
  const [assignSellerUserId, setAssignSellerUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tripSearch, setTripSearch] = useState("");

  const filteredSellers = useMemo(() => {
    const q = sellerSearch.trim().toLowerCase();
    if (!q) {
      return sellerOptions;
    }
    return sellerOptions.filter((s) => s.login.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }, [sellerOptions, sellerSearch]);

  const selectedSellerTrips = useMemo(() => {
    return tripSelectOptions.filter((t) => t.assignedSellerUserId === assignSellerUserId);
  }, [assignSellerUserId, tripSelectOptions]);

  const tripsForTable = useMemo(() => {
    const q = tripSearch.trim().toLowerCase();
    return selectedSellerTrips
      .filter((t) => tripInDateRange(t.departedAt, dateFrom, dateTo))
      .filter((t) => {
        if (!q) {
          return true;
        }
        const hay = [t.tripNumber, t.vehicleLabel ?? "", t.driverName ?? "", t.id].join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [selectedSellerTrips, dateFrom, dateTo, tripSearch]);

  const reportQueries = useQueries({
    queries: tripsForTable.map((trip) => ({
      ...shipmentReportQueryOptions(trip.id),
      enabled: Boolean(assignSellerUserId) && tripsForTable.length > 0,
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

  const sellerTotals = useMemo(() => aggregateSellerShipmentReports(loadedReports), [loadedReports]);

  const sellerLabel = assignSellerUserId ? sellerLoginById.get(assignSellerUserId) ?? assignSellerUserId : "";

  return (
    <div className="birzha-assign-seller" role="region" aria-labelledby="sold-by-seller-h">
      <header className="birzha-assign-seller__hero">
        <div>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
            <Link to={adminRoutes.home} className="birzha-ui-sm">
              ← Сводка
            </Link>
          </p>
          <h2 id="sold-by-seller-h" className="birzha-assign-seller__title">
            Продано по продавцам
          </h2>
          <p className="birzha-assign-seller__lead">
            Выберите продавца: сводка по закреплённым рейсам (кг, ₽). Даты — по выезду рейса. Поиск по логину продавца и по
            рейсам ниже.
          </p>
        </div>
      </header>

      {tripsQuery.isPending ? (
        <LoadingBlock label="Загрузка…" minHeight={64} skeleton skeletonRows={3} />
      ) : (
        <>
          <label className="birzha-field-label" htmlFor="seller-pick-search">
            Поиск продавца (логин)
          </label>
          <input
            id="seller-pick-search"
            value={sellerSearch}
            onChange={(e) => setSellerSearch(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "28rem", marginBottom: "0.5rem" }}
            placeholder="Фильтр списка…"
            autoComplete="off"
          />
          <label className="birzha-field-label" htmlFor="seller-pick">
            Продавец
          </label>
          <select
            id="seller-pick"
            value={assignSellerUserId}
            onChange={(e) => setAssignSellerUserId(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "28rem", marginBottom: "0.85rem" }}
            disabled={filteredSellers.length === 0}
          >
            <option value="">{filteredSellers.length === 0 ? "— нет продавцов —" : "— выберите продавца —"}</option>
            {filteredSellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.login}
              </option>
            ))}
          </select>
        </>
      )}

      {!assignSellerUserId ? (
        <BirzhaEmptyState compact title="Выберите продавца" description="Сводка появится после выбора в списке." />
      ) : (
        <>
          <p className="birzha-assign-seller__seller-line">
            <strong>{sellerLabel}</strong>
            <span className="birzha-assign-seller__seller-meta">рейсов закреплено: {selectedSellerTrips.length}</span>
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.5rem 0.75rem",
              marginBottom: "0.65rem",
              maxWidth: "40rem",
            }}
          >
            <div>
              <label className="birzha-field-label" htmlFor="sold-from">
                Дата выезда с
              </label>
              <input id="sold-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label className="birzha-field-label" htmlFor="sold-to">
                Дата выезда по
              </label>
              <input id="sold-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={fieldStyle} />
            </div>
          </div>
          <label className="birzha-field-label" htmlFor="sold-trip-search">
            Поиск по рейсу (номер, ТС, водитель)
          </label>
          <input
            id="sold-trip-search"
            value={tripSearch}
            onChange={(e) => setTripSearch(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "28rem", marginBottom: "0.75rem" }}
            placeholder="Необязательно"
            autoComplete="off"
          />

          {reportLoading ? (
            <p className="birzha-assign-seller__pick-status" role="status">
              <LoadingIndicator size="sm" label="Загрузка отчётов по рейсам…" />
            </p>
          ) : null}
          {reportError ? (
            <p role="alert" className="birzha-assign-seller__alert">
              Не удалось загрузить часть отчётов. Обновите страницу.
            </p>
          ) : null}

          {!reportLoading && loadedReports.length > 0 ? (
            <BirzhaDisclosure nested defaultOpen title={<span style={{ fontWeight: 600 }}>Итого по продавцу (в фильтре)</span>} hint="кг · ₽">
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
                  <span className="birzha-assign-seller__kpi-label">Остаток на рейсе</span>
                  <span className="birzha-assign-seller__kpi-value">{gramsToKgLabel(sellerTotals.netTransit.toString())} кг</span>
                </div>
                <div className="birzha-assign-seller__kpi-card">
                  <span className="birzha-assign-seller__kpi-label">Выручка</span>
                  <span className="birzha-assign-seller__kpi-value">{kopecksToRubLabel(sellerTotals.revenue.toString())} ₽</span>
                </div>
              </section>
            </BirzhaDisclosure>
          ) : null}

          <BirzhaDisclosure
            nested
            defaultOpen
            title={<h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Рейсы продавца ({tripsForTable.length})</h3>}
            hint="по фильтрам даты и поиска"
          >
            {tripsForTable.length === 0 ? (
              <BirzhaEmptyState compact title="Нет рейсов в фильтре" description="Измените даты или поиск." />
            ) : (
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table className="birzha-assign-seller__trip-table" style={tableStyle}>
                  <thead>
                    <tr>
                      <th scope="col">Рейс</th>
                      <th scope="col">Дата выезда</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Прод., кг
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Выручка
                      </th>
                      <th scope="col">Отчёт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripsForTable.map((t) => {
                      const r = reportByTripId.get(t.id);
                      const m = r ? tripLedgerMetrics(r) : null;
                      return (
                        <tr key={t.id}>
                          <td style={thtd}>
                            <strong>{t.tripNumber}</strong>
                            <div className="birzha-text-muted birzha-ui-sm" style={{ marginTop: "0.15rem" }}>
                              {[t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </td>
                          <td style={thtd} className="birzha-text-muted birzha-text-muted--lg">
                            {t.departedAt
                              ? new Date(t.departedAt).toLocaleString("ru-RU", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td style={{ ...thtd, textAlign: "right" }}>{m ? gramsToKgLabel(m.soldKg.toString()) : "—"}</td>
                          <td style={{ ...thtd, textAlign: "right" }}>
                            {r ? `${kopecksToRubLabel(r.sales.totalRevenueKopecks)} ₽` : "—"}
                          </td>
                          <td style={thtd}>
                            <Link
                              to={`${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                              style={{ fontWeight: 600 }}
                            >
                              Открыть
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </BirzhaDisclosure>
        </>
      )}
    </div>
  );
}
