import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { closeTripById } from "../api/fetch-api.js";
import type { LoadingManifestSummary, TripJson } from "../api/types.js";
import { formatTripListStatusLabel, formatTripSelectLabel, tripListFullySold } from "../format/trip-label.js";
import { sortTripsByDepartedDesc, splitTripsByStatus } from "../format/trip-sort.js";
import { loadingManifestsListQueryOptions, queryRoots, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { useAuth } from "../auth/auth-context.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyleInline, errorText, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const TRIP_WRITE_ROLES = ["admin", "manager", "logistics"] as const;

function canTripWrite(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null): boolean {
  if (!user) {
    return false;
  }
  return TRIP_WRITE_ROLES.some((r) =>
    user.roles.some((g) => g.roleCode === r && g.scopeType === "global" && g.scopeId === ""),
  );
}

type StatusFilter = "all" | "open" | "closed";

function parseStatus(v: string | null): StatusFilter {
  if (v === "open" || v === "closed" || v === "all") {
    return v;
  }
  return "open";
}

function tripMatchesSearch(t: TripJson, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) {
    return true;
  }
  const bits = [t.tripNumber, t.vehicleLabel ?? "", t.driverName ?? "", t.id].join(" ").toLowerCase();
  return bits.includes(s);
}

function filterTrips(list: TripJson[], status: StatusFilter, q: string): TripJson[] {
  return list.filter((t) => {
    if (status === "open" && t.status !== "open") {
      return false;
    }
    if (status === "closed" && t.status !== "closed") {
      return false;
    }
    return tripMatchesSearch(t, q);
  });
}

export function AdminTripRegistryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canTripWrite(user ?? null);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const [queryText, setQueryText] = useState("");

  const setStatus = (next: StatusFilter) => {
    const p = new URLSearchParams(searchParams);
    if (next === "all") {
      p.delete("status");
    } else {
      p.set("status", next);
    }
    setSearchParams(p, { replace: true });
  };

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const manQ = useQuery(loadingManifestsListQueryOptions());

  const sortedTrips = useMemo(
    () => sortTripsByDepartedDesc(tripsQ.data?.trips ?? []),
    [tripsQ.data?.trips],
  );

  const tripStatusCounts = useMemo(() => {
    const { open, closed } = splitTripsByStatus(sortedTrips);
    return { open: open.length, closed: closed.length, all: sortedTrips.length };
  }, [sortedTrips]);

  const filtered = useMemo(() => filterTrips(sortedTrips, status, queryText), [sortedTrips, status, queryText]);

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
  }, [status, queryText]);

  const closeTripMut = useMutation({
    mutationFn: async (tripId: string) => {
      const t = sortedTrips.find((x) => x.id === tripId);
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
          Список рейсов с фильтром и поиском. Нажмите «Накладные погрузки», чтобы увидеть погрузочные накладные, привязанные к
          рейсу.
        </p>
      </header>

      {loading ? <LoadingBlock label="Загрузка рейсов…" minHeight={72} skeleton skeletonRows={4} /> : null}
      {err ? (
        <p role="alert" style={errorText}>
          Не удалось загрузить данные.
        </p>
      ) : null}

      {!loading && !err ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.65rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, marginRight: "0.25rem" }}>Статус:</span>
            {(
              [
                ["open", "В работе", tripStatusCounts.open],
                ["closed", "Закрытые", tripStatusCounts.closed],
                ["all", "Все", tripStatusCounts.all],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={status === key ? "birzha-btn-ghost" : "birzha-btn-ghost"}
                style={{
                  ...btnStyleInline,
                  fontWeight: status === key ? 700 : 500,
                  borderColor: status === key ? "var(--birzha-accent)" : undefined,
                }}
                onClick={() => setStatus(key)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
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
              {status === "open"
                ? "Нет рейсов в работе. Закрытые — вкладка «Закрытые»."
                : status === "closed"
                  ? "Нет закрытых рейсов."
                  : "Нет рейсов по фильтру."}
            </p>
          ) : null}

          <BirzhaDisclosure
            defaultOpen
            title={
              <span style={{ fontWeight: 600 }}>
                {status === "open" ? "В работе" : status === "closed" ? "Закрытые" : "Список"} ({filtered.length})
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
                      const trip = sortedTrips.find((x) => x.id === expandedTripId);
                      return trip ? formatTripSelectLabel(trip) : "рейс";
                    })()}
                  </strong>
                </p>
                {(manifestsByTripId.get(expandedTripId) ?? []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.88rem" }} className="birzha-text-muted">
                    Нет привязанных накладных. Оформите погрузку в разделе «Распределение» или «Погрузка».
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.88rem" }}>
                    {(manifestsByTripId.get(expandedTripId) ?? []).map((m) => (
                      <li key={m.id} style={{ marginBottom: "0.35rem" }}>
                        <Link to={`${adminRoutes.loadingManifests}/${encodeURIComponent(m.id)}`} style={{ fontWeight: 600 }}>
                          № {m.manifestNumber}
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
            {closeTripMut.isError ? (
              <p className="birzha-text-danger birzha-ui-sm" style={{ marginTop: "0.35rem" }} role="alert">
                {(closeTripMut.error as Error).message}
              </p>
            ) : null}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
