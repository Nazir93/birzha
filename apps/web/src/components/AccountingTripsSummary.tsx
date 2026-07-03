import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripStatusLabel } from "../format/trip-label.js";
import { shipmentReportQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { accounting } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { ErrorAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

const MAX_TRIPS = 50;

/**
 * Сводка по **всем** рейсам для бухгалтера: выручка, себестоимость проданного, валовая, нал/долг.
 * Каждая строка = тот же отчёт, что в «Отчётах» по рейсу, без N+1 ручного выбора.
 */
export function AccountingTripsSummary() {
  const tripsQuery = useQuery(tripsFullListQueryOptions());

  const sortedTrips = useMemo(() => {
    return sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []).slice(0, MAX_TRIPS);
  }, [tripsQuery.data?.trips]);

  const reportQueries = useQueries({
    queries: sortedTrips.map((t) => ({
      ...shipmentReportQueryOptions(t.id),
      enabled: sortedTrips.length > 0,
    })),
  });

  const anyLoading = reportQueries.some((q) => q.isPending) && sortedTrips.length > 0;
  const hasError = reportQueries.some((q) => q.isError);

  const tripTotals = useMemo(() => {
    let kg = 0n;
    let revenue = 0n;
    let costSold = 0n;
    let costShort = 0n;
    let gross = 0n;
    let cash = 0n;
    let debt = 0n;
    let card = 0n;
    let rows = 0;
    for (let i = 0; i < sortedTrips.length; i++) {
      const q = reportQueries[i];
      if (!q?.data) {
        continue;
      }
      const r = q.data;
      kg += BigInt(r.sales.totalGrams || "0");
      revenue += BigInt(r.financials.revenueKopecks || "0");
      costSold += BigInt(r.financials.costOfSoldKopecks || "0");
      costShort += BigInt(r.financials.costOfShortageKopecks || "0");
      gross += BigInt(r.financials.grossProfitKopecks || "0");
      cash += BigInt(r.sales.totalCashKopecks || "0");
      debt += BigInt(r.sales.totalDebtKopecks || "0");
      card += BigInt(r.sales.totalCardTransferKopecks || "0");
      rows += 1;
    }
    return { kg, revenue, costSold, costShort, gross, cash, debt, card, rows };
  }, [sortedTrips, reportQueries]);

  if (tripsQuery.isPending) {
    return <LoadingBlock label="Загрузка списка рейсов…" minHeight={64} skeleton skeletonRows={6} />;
  }
  if (tripsQuery.isError) {
    return (
      <ErrorAlert message="Список рейсов не загрузился. Проверьте связь и повторите." title="Рейсы" />
    );
  }
  if (sortedTrips.length === 0) {
    return <BirzhaEmptyState compact title="Пока нет рейсов" />;
  }

  return (
    <BirzhaDisclosure
      id="acc-trips"
      defaultOpen
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-heading__eyebrow">Рейсы</span>
          <span id="acc-ledger-h" className="birzha-section-title birzha-section-title--sm">
            Выручка, себестоимость и валовая прибыль
          </span>
        </span>
      }
    >
      {anyLoading && (
        <p style={{ margin: "0 0 0.5rem" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Загрузка отчётов по рейсам…" />
        </p>
      )}
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ ...tableStyle, minWidth: 880 }} aria-label="Сводка по деньгам и рейсам">
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
                Себ. продаж, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Себ. недостачи, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Валовая прибыль, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Нал / карта / долг, ₽
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
                    <td colSpan={8} style={thtd}>
                      <ErrorAlert
                        className="birzha-alert--compact"
                        message={`Нет отчёта по рейсу ${t.tripNumber}.`}
                      />
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
                    <td colSpan={6} className="birzha-text-muted" style={thtd}>
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
                    <span className="birzha-text-muted birzha-text-muted--lg" title="статус">
                      · {formatTripStatusLabel(r.trip.status)}
                    </span>
                  </th>
                  <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(r.sales.totalGrams)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.revenueKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.costOfSoldKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.costOfShortageKopecks)}</td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                    {kopecksToRubLabel(r.financials.grossProfitKopecks)}
                  </td>
                  <td className="birzha-text-muted birzha-text-muted--lg" style={{ ...thtd, textAlign: "right" }}>
                    {kopecksToRubLabel(r.sales.totalCashKopecks)} / {kopecksToRubLabel(r.sales.totalCardTransferKopecks || "0")} /{" "}
                    {kopecksToRubLabel(r.sales.totalDebtKopecks)}
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
            {!anyLoading && tripTotals.rows > 0 && (
              <tr className="birzha-table-subtotal-row">
                <th scope="row" style={{ ...thtd, textAlign: "left" }}>
                  Итого ({tripTotals.rows} рейс.)
                </th>
                <td style={{ ...thtd, textAlign: "right" }}>{gramsToKgLabel(tripTotals.kg.toString())}</td>
                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(tripTotals.revenue.toString())}</td>
                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(tripTotals.costSold.toString())}</td>
                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(tripTotals.costShort.toString())}</td>
                <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(tripTotals.gross.toString())}</td>
                <td className="birzha-text-muted birzha-text-muted--lg" style={{ ...thtd, textAlign: "right" }}>
                  {kopecksToRubLabel(tripTotals.cash.toString())} / {kopecksToRubLabel(tripTotals.card.toString())} /{" "}
                  {kopecksToRubLabel(tripTotals.debt.toString())}
                </td>
                <td style={thtd} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasError && !anyLoading ? (
        <WarningAlert title="Отчёты">Часть отчётов не загрузилась — обновите страницу.</WarningAlert>
      ) : null}
    </BirzhaDisclosure>
  );
}
