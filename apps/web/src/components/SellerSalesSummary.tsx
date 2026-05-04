import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";

import type { BatchListItem } from "../api/types.js";
import { formatBatchPartyCaption, formatShortBatchId } from "../format/batch-label.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { batchesByIdsQueryOptions, shipmentReportQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { sales } from "../routes.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { errorText, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

const MAX_TRIPS = 50;

function productName(b: BatchListItem | undefined): string {
  return b?.nakladnaya?.productGroup?.trim() || "—";
}

function caliberName(b: BatchListItem | undefined, batchId: string): string {
  return b?.nakladnaya?.productGradeCode?.trim() || formatShortBatchId(batchId);
}

export function SellerSalesSummary() {
  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const trips = useMemo(
    () => sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []).slice(0, MAX_TRIPS),
    [tripsQuery.data?.trips],
  );

  const reportQueries = useQueries({
    queries: trips.map((t) => ({
      ...shipmentReportQueryOptions(t.id),
      enabled: trips.length > 0,
    })),
  });

  const salesFingerprint = reportQueries
    .map((q) => `${q.status}:${q.data?.sales.totalGrams ?? ""}:${q.data?.sales.totalRevenueKopecks ?? ""}`)
    .join("|");

  const soldBatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const q of reportQueries) {
      for (const row of q.data?.sales.byBatch ?? []) {
        if (BigInt(row.grams) > 0n) {
          ids.add(row.batchId);
        }
      }
    }
    return [...ids].sort();
  }, [salesFingerprint]);

  const batchesQuery = useQuery(batchesByIdsQueryOptions(soldBatchIds));
  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const rows = useMemo(() => {
    const out: {
      key: string;
      tripId: string;
      tripNumber: string;
      batchId: string;
      product: string;
      caliber: string;
      caption: string;
      grams: string;
      revenueKopecks: string;
      cashKopecks: string;
      debtKopecks: string;
    }[] = [];

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      const report = reportQueries[i]?.data;
      if (!trip || !report) {
        continue;
      }
      for (const sale of report.sales.byBatch) {
        if (BigInt(sale.grams) <= 0n) {
          continue;
        }
        const batch = batchById.get(sale.batchId);
        out.push({
          key: `${trip.id}-${sale.batchId}`,
          tripId: trip.id,
          tripNumber: trip.tripNumber,
          batchId: sale.batchId,
          product: productName(batch),
          caliber: caliberName(batch, sale.batchId),
          caption: formatBatchPartyCaption(batch, sale.batchId),
          grams: sale.grams,
          revenueKopecks: sale.revenueKopecks,
          cashKopecks: sale.cashKopecks,
          debtKopecks: sale.debtKopecks,
        });
      }
    }
    return out.sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru") || a.caption.localeCompare(b.caption, "ru"));
  }, [trips, reportQueries, batchById]);

  const totals = useMemo(() => {
    let grams = 0n;
    let revenue = 0n;
    let cash = 0n;
    let debt = 0n;
    for (const row of rows) {
      grams += BigInt(row.grams);
      revenue += BigInt(row.revenueKopecks);
      cash += BigInt(row.cashKopecks);
      debt += BigInt(row.debtKopecks);
    }
    return { grams, revenue, cash, debt };
  }, [rows]);

  const reportsLoading = reportQueries.some((q) => q.isPending) && trips.length > 0;
  const reportsError = reportQueries.some((q) => q.isError);

  if (tripsQuery.isPending) {
    return <LoadingBlock label="Загрузка ваших рейсов…" minHeight={72} />;
  }
  if (tripsQuery.isError) {
    return (
      <p style={errorText} role="alert">
        Не удалось загрузить ваши рейсы. Проверьте связь и повторите.
      </p>
    );
  }

  return (
    <section className="birzha-home-work-card" aria-labelledby="seller-sales-summary-h">
      <div className="birzha-section-heading">
        <div>
          <p className="birzha-section-heading__eyebrow">Мои продажи</p>
          <h3 id="seller-sales-summary-h" className="birzha-section-title birzha-section-title--sm">
            Продано по рейсам, товару и калибру
          </h3>
        </div>
        <p className="birzha-section-heading__note">Если рейса нет, попросите администратора закрепить его за вами.</p>
      </div>

      {trips.length === 0 ? (
        <p style={{ ...muted, marginTop: 0 }}>Пока нет закреплённых рейсов.</p>
      ) : (
        <>
          <div className="birzha-kpi-grid birzha-kpi-grid--dense" style={{ marginBottom: "0.8rem" }}>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <span className="birzha-kpi-tile__label">Продано, кг</span>
              <strong className="birzha-kpi-tile__value">{gramsToKgLabel(totals.grams.toString())}</strong>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <span className="birzha-kpi-tile__label">Выручка</span>
              <strong className="birzha-kpi-tile__value">{kopecksToRubLabel(totals.revenue.toString())} ₽</strong>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <span className="birzha-kpi-tile__label">Нал / долг</span>
              <strong className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                {kopecksToRubLabel(totals.cash.toString())} / {kopecksToRubLabel(totals.debt.toString())} ₽
              </strong>
            </div>
          </div>

          {reportsLoading || batchesQuery.isFetching ? (
            <p style={{ ...muted, marginTop: 0 }} role="status">
              <LoadingIndicator size="sm" label="Обновление сводки продаж…" />
            </p>
          ) : null}
          {reportsError ? (
            <p style={errorText} role="alert">
              Часть отчётов по рейсам не загрузилась. Обновите страницу или проверьте связь.
            </p>
          ) : null}

          {rows.length === 0 ? (
            <p style={{ ...muted, marginBottom: 0 }}>Продаж по вашим рейсам пока нет.</p>
          ) : (
            <div className="birzha-table-scroll">
              <table style={{ ...tableStyle, minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={thHead}>Рейс</th>
                    <th style={thHead}>Товар</th>
                    <th style={thHead}>Калибр</th>
                    <th style={thHead}>Накладная / партия</th>
                    <th style={thHead}>Продано</th>
                    <th style={thHead}>Выручка</th>
                    <th style={thHead}>Нал</th>
                    <th style={thHead}>Долг</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td style={thtd}>
                        <Link to={`${sales.reports}?trip=${encodeURIComponent(row.tripId)}`}>{row.tripNumber}</Link>
                      </td>
                      <td style={thtd}>{row.product}</td>
                      <td style={thtd}>{row.caliber}</td>
                      <td style={thtd}>{row.caption}</td>
                      <td style={thtd}>{gramsToKgLabel(row.grams)} кг</td>
                      <td style={thtd}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                      <td style={thtd}>{kopecksToRubLabel(row.cashKopecks)} ₽</td>
                      <td style={thtd}>{kopecksToRubLabel(row.debtKopecks)} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
