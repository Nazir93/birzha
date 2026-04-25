import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { apiGetJson } from "../api/fetch-api.js";
import type { ShipmentReportResponse, TripsListResponse } from "../api/types.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { accounting } from "../routes.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

const MAX_TRIPS = 50;

/**
 * Сводка по **всем** рейсам для бухгалтера: выручка, себестоимость проданного, валовая, нал/долг.
 * Каждая строка = тот же отчёт, что в «Отчётах» по рейсу, без N+1 ручного выбора.
 */
export function AccountingTripsSummary() {
  const tripsQuery = useQuery({
    queryKey: ["trips"],
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    retry: 1,
  });

  const sortedTrips = useMemo(() => {
    const list = tripsQuery.data?.trips ?? [];
    return [...list]
      .sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"))
      .slice(0, MAX_TRIPS);
  }, [tripsQuery.data?.trips]);

  const reportQueries = useQueries({
    queries: sortedTrips.map((t) => ({
      queryKey: ["shipment-report", t.id] as const,
      queryFn: () => apiGetJson<ShipmentReportResponse>(`/api/trips/${encodeURIComponent(t.id)}/shipment-report`),
      enabled: sortedTrips.length > 0,
      staleTime: 20_000,
    })),
  });

  const anyLoading = reportQueries.some((q) => q.isPending) && sortedTrips.length > 0;
  const hasError = reportQueries.some((q) => q.isError);

  if (tripsQuery.isPending) {
    return <LoadingBlock label="Загрузка списка рейсов…" minHeight={64} />;
  }
  if (tripsQuery.isError) {
    return (
      <p style={errorText} role="alert">
        Список рейсов не загрузился. Проверьте API и сеть.
      </p>
    );
  }
  if (sortedTrips.length === 0) {
    return (
      <p style={muted}>
        Пока нет рейсов. После того как логист/склад введут рейс, здесь появятся итоги; продажи с рейса — в кабинете
        «Операции».
      </p>
    );
  }

  const totalInDb = tripsQuery.data?.trips.length ?? 0;
  const moreThanTable = totalInDb > MAX_TRIPS;

  return (
    <div style={{ marginTop: "1.25rem" }} role="region" aria-labelledby="acc-ledger-h">
      <h3 id="acc-ledger-h" style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>
        Деньги по рейсам (сводка)
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Выручка, себестоимость закупа по проданной массе, валовая прибыль — как в детальном отчёте. До {MAX_TRIPS}{" "}
        рейсов.         Разбивка по клиентам и печать — в «Детали».
      </p>
      {moreThanTable ? (
        <p style={{ ...muted, margin: "0 0 0.5rem" }}>
          Всего в системе {totalInDb} рейсов; в сводку попадают первые {MAX_TRIPS} (по номеру). Остальные — выберите
          вручную в «Отчётах».
        </p>
      ) : null}
      {anyLoading && (
        <p style={muted} role="status" aria-live="polite">
          Загрузка отчётов…
        </p>
      )}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ ...tableStyle, minWidth: 720, fontSize: "0.88rem" }} aria-label="Сводка по деньгам и рейсам">
          <thead>
            <tr>
              <th scope="col" style={thHead}>
                Рейс
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Продажа, кг
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Выручка, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Себестоим. проданного, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Валовая, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Нал / долг, ₽
              </th>
              <th scope="col" style={thHead}>
                Детали
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTrips.map((t, i) => {
              const q = reportQueries[i];
              if (!q) {
                return null;
              }
              if (q.isError) {
                return (
                  <tr key={t.id}>
                    <td colSpan={7} style={thtd}>
                      <span role="alert" style={errorText}>
                        Нет отчёта: {t.tripNumber}
                      </span>
                    </td>
                  </tr>
                );
              }
              if (!q.data) {
                return (
                  <tr key={t.id}>
                    <td style={thtd}>
                      <strong>{t.tripNumber}</strong>
                    </td>
                    <td colSpan={5} style={{ ...thtd, ...muted }}>
                      …
                    </td>
                    <td style={thtd}>
                      <Link to={`${accounting.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}>К отчёту</Link>
                    </td>
                  </tr>
                );
              }
              const r = q.data;
              return (
                <tr key={t.id}>
                  <th scope="row" style={thtd}>
                    <strong>{r.trip.tripNumber}</strong>{" "}
                    <span style={muted} title="статус">
                      · {r.trip.status}
                    </span>
                  </th>
                  <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(r.sales.totalGrams)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.revenueKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.costOfSoldKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                    {kopecksToRubLabel(r.financials.grossProfitKopecks)}
                  </td>
                  <td style={{ ...thtd, textAlign: "right", fontSize: "0.85rem" }}>
                    {kopecksToRubLabel(r.sales.totalCashKopecks)} / {kopecksToRubLabel(r.sales.totalDebtKopecks)}
                  </td>
                  <td style={thtd}>
                    <Link
                      to={`${accounting.reports}?${new URLSearchParams({ trip: t.id }).toString()}`}
                      style={{ fontWeight: 600 }}
                    >
                      Детали
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasError && !anyLoading ? (
        <p style={{ ...muted, marginTop: "0.5rem" }}>Часть отчётов не загрузилась — обновите страницу.</p>
      ) : null}
    </div>
  );
}
