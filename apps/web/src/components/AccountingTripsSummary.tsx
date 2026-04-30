import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { shipmentReportQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { accounting } from "../routes.js";
import { HorizontalBarChart } from "../ui/charts/HorizontalBarChart.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

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

  const reportRevenueFingerprint = reportQueries
    .map((q) => `${q.status}:${q.data?.financials.revenueKopecks ?? ""}`)
    .join("|");

  const revenueChartItems = useMemo(() => {
    const items: { label: string; value: number; display: string }[] = [];
    for (let i = 0; i < sortedTrips.length; i++) {
      const q = reportQueries[i];
      const t = sortedTrips[i];
      if (!t || !q?.data) {
        continue;
      }
      const kopecks = Number(q.data.financials.revenueKopecks || 0);
      const rub = kopecks / 100;
      if (rub <= 0) {
        continue;
      }
      items.push({
        label: t.tripNumber,
        value: rub,
        display: `${rub.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽`,
      });
    }
    return items;
  }, [sortedTrips, reportRevenueFingerprint]);

  const tripTotals = useMemo(() => {
    let kg = 0n;
    let revenue = 0n;
    let costSold = 0n;
    let costShort = 0n;
    let gross = 0n;
    let cash = 0n;
    let debt = 0n;
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
      rows += 1;
    }
    return { kg, revenue, costSold, costShort, gross, cash, debt, rows };
  }, [sortedTrips, reportQueries]);

  if (tripsQuery.isPending) {
    return <LoadingBlock label="Загрузка списка рейсов…" minHeight={64} />;
  }
  if (tripsQuery.isError) {
    return (
      <p style={errorText} role="alert">
        Список рейсов не загрузился. Проверьте связь и повторите.
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
    <div style={{ marginTop: "1.25rem" }} role="region" aria-labelledby="acc-ledger-h" id="acc-trips">
      <h3 id="acc-ledger-h" style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>
        Выручка, себестоимость и валовая прибыль по рейсам
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.55 }}>
        <strong>Выручка</strong> — из журнала продаж; <strong>себестоимость проданного</strong> и{" "}
        <strong>недостачи</strong> — по закупочной цене партии (руб/кг);{" "}
        <strong>валовая прибыль</strong> = выручка − себестоимость продаж − себестоимость недостач. Расходы на логистику
        и прочие накладные в этой цифре <strong>не вычитаются</strong> — отдельного учёта расходов рейса в системе нет.
        До {MAX_TRIPS} рейсов в таблице; разбивка по клиентам — в «Детали».
      </p>
      {moreThanTable ? (
        <p style={{ ...muted, margin: "0 0 0.5rem" }}>
          Всего в системе {totalInDb} рейсов; в сводку попадают первые {MAX_TRIPS} (по номеру). Остальные — выберите
          вручную в «Отчётах».
        </p>
      ) : null}
      {revenueChartItems.length > 0 ? (
        <div className="birzha-chart-card" style={{ marginBottom: "0.9rem" }}>
          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>Выручка по рейсам</h4>
          <HorizontalBarChart
            items={revenueChartItems}
            emptyHint="Нет данных для диаграммы."
            valueSuffix="₽"
          />
        </div>
      ) : null}
      {anyLoading && (
        <p style={muted} role="status" aria-live="polite">
          Загрузка отчётов…
        </p>
      )}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ ...tableStyle, minWidth: 880, fontSize: "0.88rem" }} aria-label="Сводка по деньгам и рейсам">
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
                    <td colSpan={8} style={thtd}>
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
                    <td colSpan={6} style={{ ...thtd, ...muted }}>
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
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(r.financials.costOfShortageKopecks)}</td>
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
                <td style={{ ...thtd, textAlign: "right", fontSize: "0.85rem" }}>
                  {kopecksToRubLabel(tripTotals.cash.toString())} / {kopecksToRubLabel(tripTotals.debt.toString())}
                </td>
                <td style={thtd} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasError && !anyLoading ? (
        <p style={{ ...muted, marginTop: "0.5rem" }}>Часть отчётов не загрузилась — обновите страницу.</p>
      ) : null}
    </div>
  );
}
