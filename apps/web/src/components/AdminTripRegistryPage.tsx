import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import type { LoadingManifestSummary, TripJson } from "../api/types.js";
import { formatTripListStatusLabel, formatTripSelectLabel, tripListFullySold } from "../format/trip-label.js";
import { formatLoadingManifestDisplayName } from "../format/loading-manifest.js";
import { filterTripsInWork } from "../format/archive.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { loadingManifestsListQueryOptions, queryRoots, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyleInline, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function tripMatchesSearch(t: TripJson, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) {
    return true;
  }
  const bits = [t.tripNumber, t.vehicleLabel ?? "", t.driverName ?? "", t.id].join(" ").toLowerCase();
  return bits.includes(s);
}

export function AdminTripRegistryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canCreateTrip(user ?? null);
  const [searchParams] = useSearchParams();
  const legacyStatus = searchParams.get("status");
  const [queryText, setQueryText] = useState("");

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const manQ = useQuery(loadingManifestsListQueryOptions());

  const sortedTripsOpen = useMemo(
    () => sortTripsByDepartedDesc(filterTripsInWork(tripsQ.data?.trips ?? [])),
    [tripsQ.data?.trips],
  );

  const filtered = useMemo(
    () => sortedTripsOpen.filter((t) => tripMatchesSearch(t, queryText)),
    [sortedTripsOpen, queryText],
  );

  const manifestsByTripId = useMemo(() => {
    const m = new Map<string, LoadingManifestSummary[]>();
    for (const man of manQ.data?.loadingManifests ?? []) {
      const tid = man.tripId?.trim();
      if (!tid) {
        continue;
      }
      const arr = m.get(tid) ?? [];
      arr.push(man);
      m.set(tid, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => b.docDate.localeCompare(a.docDate) || b.manifestNumber.localeCompare(a.manifestNumber, "ru"));
    }
    return m;
  }, [manQ.data?.loadingManifests]);

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedTripId(null);
  }, [queryText]);

  const closeTripMut = useMutation({
    mutationFn: async (tripId: string) => {
      const t = sortedTripsOpen.find((x) => x.id === tripId);
      if (!t) {
        throw new Error("Рейс не найден в списке");
      }
      if (!tripListFullySold(t)) {
        const ok = window.confirm(
          "По данным системы ещё есть остаток погруженного (в машине). Закрыть рейс всё равно? Обычно закрывают после полной продажи.",
        );
        if (!ok) {
          return;
        }
      }
      await closeTripById(tripId, "Нет прав: закрытие рейса — роли admin, manager, logistics");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    },
  });

  const loading = tripsQ.isPending || manQ.isPending;
  const err = tripsQ.isError || manQ.isError;

  if (legacyStatus === "closed" || legacyStatus === "all") {
    return <Navigate to={adminRoutes.archive} replace />;
  }

  return (
    <div className="birzha-admin-dash" role="region" aria-labelledby="trip-registry-h">
      <header style={{ marginBottom: "0.85rem" }}>
        <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
          <Link to={adminRoutes.home} className="birzha-ui-sm">
            ← Сводка
          </Link>
        </p>
        <h2 id="trip-registry-h" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          Рейсы
        </h2>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem", color: "var(--color-muted)", maxWidth: 52 * 16 }}>
          Только рейсы в работе. Закрытые — в разделе{" "}
          <Link to={adminRoutes.archive}>«Архив»</Link>. Нажмите «Накладные погрузки» для погрузочных по рейсу.
        </p>
      </header>

      {loading ? <LoadingBlock label="Загрузка рейсов…" minHeight={72} skeleton skeletonRows={4} /> : null}
      {err ? <ErrorAlert message="Не удалось загрузить данные." title="Реестр рейсов" /> : null}

      {!loading && !err ? (
        <>
          <label className="birzha-field-label" htmlFor="trip-registry-search">
            Поиск по номеру рейса, ТС, водителю или id
          </label>
          <input
            id="trip-registry-search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "28rem", marginBottom: "0.75rem" }}
            placeholder="Начните вводить…"
            autoComplete="off"
          />

          {filtered.length === 0 ? (
            <p className="birzha-text-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
              Нет рейсов в работе. Закрытые — в разделе <Link to={adminRoutes.archive}>«Архив»</Link>.
            </p>
          ) : null}

          <BirzhaDisclosure
            defaultOpen
            title={
              <span style={{ fontWeight: 600 }}>
                В работе ({filtered.length})
              </span>
            }
          >
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={tableStyle} aria-label="Рейсы">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      № рейса
                    </th>
                    <th scope="col" style={thHead}>
                      Статус
                    </th>
                    <th scope="col" style={thHead}>
                      Дата выезда
                    </th>
                    <th scope="col" style={thHead}>
                      ТС / водитель
                    </th>
                    <th scope="col" style={thHead}>
                      Накладные погрузки
                    </th>
                    <th scope="col" style={thHead}>
                      Отчёт
                    </th>
                    {showCloseTrip ? (
                      <th scope="col" style={thHead}>
                        Закрытие
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const mans = manifestsByTripId.get(t.id) ?? [];
                    const open = expandedTripId === t.id;
                    return (
                      <tr key={t.id}>
                        <th scope="row" style={thtd}>
                          <Link
                            to={`${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                            style={{ fontWeight: 700, textDecoration: "none" }}
                          >
                            {t.tripNumber}
                          </Link>
                        </th>
                        <td style={thtd}>
                          <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
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
                        <td style={thtd} className="birzha-text-muted birzha-text-muted--lg">
                          {[t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={thtd}>
                          <button
                            type="button"
                            className="birzha-ui-sm"
                            style={btnStyleInline}
                            aria-expanded={open}
                            onClick={() => setExpandedTripId(open ? null : t.id)}
                          >
                            {mans.length === 0
                              ? open
                                ? "Скрыть"
                                : "Нет накладных"
                              : `${mans.length} шт.${open ? " ▲" : " ▼"}`}
                          </button>
                        </td>
                        <td style={thtd}>
                          <Link
                            to={`${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                            style={{ fontWeight: 600 }}
                          >
                            Отчёт
                          </Link>
                        </td>
                        {showCloseTrip ? (
                          <td style={thtd}>
                            {t.status === "open" ? (
                              <button
                                type="button"
                                className="birzha-ui-sm"
                                style={btnStyleInline}
                                disabled={closeTripMut.isPending}
                                onClick={() => closeTripMut.mutate(t.id)}
                              >
                                {closeTripMut.isPending ? "…" : "Закрыть"}
                              </button>
                            ) : (
                              <span className="birzha-text-muted birzha-ui-sm">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {expandedTripId ? (
              <div
                style={{
                  marginTop: "0.65rem",
                  padding: "0.65rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--birzha-surface-muted)",
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
                  Погрузочные накладные рейса{" "}
                  <strong>
                    {(() => {
                      const trip = sortedTripsOpen.find((x) => x.id === expandedTripId);
                      return trip ? formatTripSelectLabel(trip) : "рейс";
                    })()}
                  </strong>
                </p>
                {(manifestsByTripId.get(expandedTripId) ?? []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.88rem" }} className="birzha-text-muted">
                    Нет привязанных накладных. Оформите погрузку в разделе «Погрузка на машину».
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.88rem" }}>
                    {(manifestsByTripId.get(expandedTripId) ?? []).map((m) => (
                      <li key={m.id} style={{ marginBottom: "0.35rem" }}>
                        <Link to={`${adminRoutes.distribution}/${encodeURIComponent(m.id)}`} style={{ fontWeight: 600 }}>
                          {formatLoadingManifestDisplayName({
                            manifestNumber: m.manifestNumber,
                            destinationName: m.destinationName,
                          })}
                        </Link>
                        <span className="birzha-text-muted">
                          {" "}
                          · {new Date(m.docDate).toLocaleDateString("ru-RU")} · {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг ·{" "}
                          {m.destinationName}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {closeTripMut.isError ? <ErrorAlert error={closeTripMut.error} title="Закрытие рейса" /> : null}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
