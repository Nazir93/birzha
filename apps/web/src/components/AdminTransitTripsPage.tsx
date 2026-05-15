import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { TripJson } from "../api/types.js";
import { formatTripListStatusLabel } from "../format/trip-label.js";
import { tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function tripHasTransitMass(t: TripJson): boolean {
  if (t.status !== "open") {
    return false;
  }
  const g = t.transitRemainingGrams;
  if (g == null || g === "") {
    return false;
  }
  try {
    return BigInt(g) > 0n;
  } catch {
    return false;
  }
}

function tripMatchesSearch(t: TripJson, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) {
    return true;
  }
  const bits = [t.tripNumber, t.vehicleLabel ?? "", t.driverName ?? "", t.id].join(" ").toLowerCase();
  return bits.includes(s);
}

function tripInDateRange(t: TripJson, from: string, to: string): boolean {
  if (!from.trim() && !to.trim()) {
    return true;
  }
  if (!t.departedAt) {
    return false;
  }
  const d = new Date(t.departedAt);
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

export function AdminTransitTripsPage() {
  const tripsQ = useQuery(tripsFullListQueryOptions());
  const [queryText, setQueryText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const rows = useMemo(() => {
    const list = tripsQ.data?.trips ?? [];
    return list
      .filter(tripHasTransitMass)
      .filter((t) => tripMatchesSearch(t, queryText))
      .filter((t) => tripInDateRange(t, dateFrom, dateTo))
      .sort((a, b) => {
        const da = a.departedAt ? Date.parse(a.departedAt) : 0;
        const db = b.departedAt ? Date.parse(b.departedAt) : 0;
        if (db !== da) {
          return db - da;
        }
        return b.tripNumber.localeCompare(a.tripNumber, "ru");
      });
  }, [tripsQ.data?.trips, queryText, dateFrom, dateTo]);

  return (
    <div className="birzha-admin-dash" role="region" aria-labelledby="transit-trips-h">
      <header style={{ marginBottom: "0.85rem" }}>
        <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
          <Link to={adminRoutes.home} className="birzha-ui-sm">
            ← Сводка
          </Link>
        </p>
        <h2 id="transit-trips-h" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          Рейсы с остатком
        </h2>
      </header>

      {tripsQ.isPending ? <LoadingBlock label="Загрузка рейсов…" minHeight={72} skeleton skeletonRows={4} /> : null}
      {tripsQ.isError ? (
        <p role="alert" style={errorText}>
          Не удалось загрузить рейсы.
        </p>
      ) : null}

      {!tripsQ.isPending && !tripsQ.isError ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.5rem 0.75rem",
              marginBottom: "0.65rem",
              maxWidth: "36rem",
            }}
          >
            <div>
              <label className="birzha-field-label" htmlFor="transit-from">
                Дата с
              </label>
              <input
                id="transit-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="birzha-field-label" htmlFor="transit-to">
                Дата по
              </label>
              <input id="transit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={fieldStyle} />
            </div>
          </div>
          <label className="birzha-field-label" htmlFor="transit-search">
            Поиск по номеру рейса, ТС, водителю
          </label>
          <input
            id="transit-search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "28rem", marginBottom: "0.75rem" }}
            placeholder="Начните вводить…"
            autoComplete="off"
          />

          <BirzhaDisclosure
            defaultOpen
            title={<span style={{ fontWeight: 600 }}>Список ({rows.length})</span>}
          >
            {rows.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.9rem" }} className="birzha-text-muted">
                Нет подходящих рейсов. Измените фильтры или дождитесь отгрузки в рейс.
              </p>
            ) : (
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table style={tableStyle} aria-label="Рейсы с ненулевым погруженным остатком">
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
                        Отчёт
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <th scope="row" style={thtd}>
                          <strong>{t.tripNumber}</strong>
                        </th>
                        <td style={thtd}>{formatTripListStatusLabel(t)}</td>
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
                          <Link
                            to={`${adminRoutes.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                            style={{ fontWeight: 600 }}
                          >
                            Открыть отчёт
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
