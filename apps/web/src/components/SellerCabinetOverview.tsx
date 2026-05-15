import { useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { TRIP_STATUS_CLOSED, isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import { batchesByIdsQueryOptions, shipmentReportQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { sales } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { errorText, fieldStyleFullWidth, tableStyle, thHead, thtd } from "../ui/styles.js";

const MAX_TRIPS = 50;

function bi(x: string | undefined): bigint {
  if (x === undefined || x === "") {
    return 0n;
  }
  return BigInt(x);
}

function aggregateSalesByProductLine(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
): { lineLabel: string; grams: bigint; revenue: bigint; cash: bigint; debt: bigint; card: bigint }[] {
  const m = new Map<
    string,
    { lineLabel: string; grams: bigint; revenue: bigint; cash: bigint; debt: bigint; card: bigint }
  >();
  for (const s of report.sales.byBatch) {
    const g = bi(s.grams);
    if (g <= 0n) {
      continue;
    }
    const b = batchById.get(s.batchId);
    const lineLabel = b ? formatNakladLineLabel(b) : `партия ${formatShortBatchId(s.batchId)}`;
    let row = m.get(lineLabel);
    if (!row) {
      row = { lineLabel, grams: 0n, revenue: 0n, cash: 0n, debt: 0n, card: 0n };
      m.set(lineLabel, row);
    }
    row.grams += g;
    row.revenue += bi(s.revenueKopecks);
    row.cash += bi(s.cashKopecks);
    row.debt += bi(s.debtKopecks);
    row.card += bi(s.cardTransferKopecks ?? "0");
  }
  return [...m.values()].sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
}

/**
 * Краткая сводка по одному рейсу на главной `/s`: выбор рейса, итоги, оплата, продажи по товару/калибру.
 * Полная таблица партий и клиентов — только в «Отчёты по рейсу» (`TripReportPanel`).
 */
export function SellerCabinetOverview() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const rawTrips = tripsQuery.data?.trips ?? [];

  const trips = useMemo(() => {
    const sorted = sortTripsByTripNumberAsc(rawTrips).slice(0, MAX_TRIPS);
    if (!user || !isFieldSellerOnly(user)) {
      return sorted;
    }
    return sorted.filter(
      (t) => t.assignedSellerUserId === user.id && isTripOpenForSellerWorkspace(t),
    );
  }, [rawTrips, user]);

  const sellerHasOnlyClosedTrips = useMemo(() => {
    if (!user || !isFieldSellerOnly(user)) {
      return false;
    }
    const mine = rawTrips.filter((t) => t.assignedSellerUserId === user.id);
    return mine.length > 0 && mine.every((t) => !isTripOpenForSellerWorkspace(t));
  }, [rawTrips, user]);

  const urlTrip = searchParams.get("trip")?.trim() ?? "";

  /** Закрытый рейс в URL — убираем `?trip=`, чтобы главная и форма не «держали» старый рейс. */
  useEffect(() => {
    if (!user || !isFieldSellerOnly(user) || !urlTrip) {
      return;
    }
    const t = rawTrips.find((x) => x.id === urlTrip);
    if (!t || t.assignedSellerUserId !== user.id || t.status !== TRIP_STATUS_CLOSED) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("trip");
    const qs = next.toString();
    void navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [user, urlTrip, rawTrips, searchParams, navigate, pathname]);

  const effectiveTripId = useMemo(() => {
    if (trips.length === 0) {
      return "";
    }
    if (urlTrip && trips.some((t) => t.id === urlTrip)) {
      return urlTrip;
    }
    if (trips.length === 1) {
      return trips[0]!.id;
    }
    return "";
  }, [trips, urlTrip]);

  /** При одном рейсе фиксируем `?trip=` — форма «Продажа с рейса» и сводка согласованы с URL. */
  useEffect(() => {
    if (trips.length !== 1) {
      return;
    }
    const only = trips[0]!.id;
    if (urlTrip === only) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("trip", only);
    const qs = next.toString();
    void navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [trips, urlTrip, navigate, searchParams, pathname]);

  const reportQuery = useQuery({
    ...shipmentReportQueryOptions(effectiveTripId),
    enabled: Boolean(effectiveTripId),
  });
  const r = reportQuery.data;

  const batchIds = useMemo(() => {
    if (!r) {
      return [] as string[];
    }
    const ids = new Set<string>();
    for (const row of r.sales.byBatch) {
      if (bi(row.grams) > 0n) {
        ids.add(row.batchId);
      }
    }
    return [...ids].sort();
  }, [r]);

  const batchesQuery = useQuery(batchesByIdsQueryOptions(batchIds));
  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const caliberRows = useMemo(() => (r ? aggregateSalesByProductLine(r, batchById) : []), [r, batchById]);

  const setTripInUrl = (tripId: string) => {
    const next = new URLSearchParams(searchParams);
    if (tripId) {
      next.set("trip", tripId);
    } else {
      next.delete("trip");
    }
    const qs = next.toString();
    void navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  };

  if (tripsQuery.isPending) {
    return <LoadingBlock label="Загрузка ваших рейсов…" minHeight={72} skeleton skeletonRows={4} />;
  }
  if (tripsQuery.isError) {
    return (
      <p style={errorText} role="alert">
        Не удалось загрузить ваши рейсы. Проверьте связь и повторите.
      </p>
    );
  }

  if (trips.length === 0) {
    return (
      <BirzhaEmptyState
        compact
        title={sellerHasOnlyClosedTrips ? "Активных рейсов нет" : "Нет закреплённых рейсов"}
        description={
          sellerHasOnlyClosedTrips
            ? "Закрытые рейсы не показываются здесь, чтобы не путаться с продажами. Итоги и история — в разделе «Отчёты по рейсу»."
            : "Когда администратор закрепит за вами рейс, здесь появится выбор и сводка."
        }
      />
    );
  }

  return (
    <BirzhaDisclosure
      defaultOpen
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-heading__eyebrow">Сводка</span>
          <span className="birzha-section-title birzha-section-title--sm">По выбранному рейсу</span>
        </span>
      }
      hint="детали по партиям и клиентам — в «Отчёты по рейсу»"
    >
      <div className="no-print" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor="seller-cabinet-trip-select" className="birzha-text-muted birzha-text-muted--lg" style={{ display: "block", marginBottom: "0.35rem" }}>
          Выберите рейс
        </label>
        <select
          id="seller-cabinet-trip-select"
          value={effectiveTripId && trips.some((t) => t.id === effectiveTripId) ? effectiveTripId : ""}
          onChange={(e) => setTripInUrl(e.target.value)}
          style={fieldStyleFullWidth}
        >
          {trips.length > 1 ? <option value="">— выберите рейс —</option> : null}
          {trips.map((t) => {
            const label = formatTripSelectLabel(t);
            return (
              <option key={t.id} value={t.id}>
                {label.length > 120 ? `${label.slice(0, 117)}…` : label}
              </option>
            );
          })}
        </select>
        {effectiveTripId ? (
          <p className="birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
            <Link to={`${sales.reports}?trip=${encodeURIComponent(effectiveTripId)}`}>Полный отчёт по рейсу</Link>
            {" — "}
            партии, клиенты, CSV.
          </p>
        ) : null}
      </div>

      {!effectiveTripId ? (
        <BirzhaEmptyState compact title="Выберите рейс" description="Краткая сводка появится после выбора в списке выше." />
      ) : reportQuery.isPending ? (
        <LoadingBlock label="Загрузка отчёта…" minHeight={64} skeleton skeletonRows={3} />
      ) : reportQuery.isError ? (
        <p style={errorText} role="alert">
          Отчёт по рейсу не загрузился. Попробуйте снова или откройте полный отчёт.
        </p>
      ) : r ? (
        <>
          {reportQuery.isFetching && !reportQuery.isPending ? (
            <p style={{ marginTop: 0 }} role="status">
              <LoadingIndicator size="sm" label="Обновление…" />
            </p>
          ) : null}

          <div className="birzha-kpi-grid birzha-seller-kpi-grid" style={{ marginBottom: "0.85rem" }}>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Продано, кг</div>
              <div className="birzha-kpi-tile__value">{gramsToKgLabel(r.sales.totalGrams)}</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Выручка</div>
              <div className="birzha-kpi-tile__value">{kopecksToRubLabel(r.sales.totalRevenueKopecks)} ₽</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Розница / опт</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
                <div className="birzha-kpi-tile__cash-debt-row">
                  <span className="birzha-kpi-tile__cash-debt-key">Розница</span>
                  <span>
                    {gramsToKgLabel(r.sales.retailGrams)} кг · {kopecksToRubLabel(r.sales.retailRevenueKopecks)} ₽
                  </span>
                </div>
                <div className="birzha-kpi-tile__cash-debt-row">
                  <span className="birzha-kpi-tile__cash-debt-key">Опт</span>
                  <span>
                    {gramsToKgLabel(r.sales.wholesaleGrams)} кг · {kopecksToRubLabel(r.sales.wholesaleRevenueKopecks)} ₽
                  </span>
                </div>
              </div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--premium">
              <div className="birzha-kpi-tile__label">Оплата</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md birzha-kpi-tile__cash-debt">
                <div className="birzha-kpi-tile__cash-debt-row">
                  <span className="birzha-kpi-tile__cash-debt-key">Нал</span>
                  <span>{kopecksToRubLabel(r.sales.totalCashKopecks)} ₽</span>
                </div>
                <div className="birzha-kpi-tile__cash-debt-row">
                  <span className="birzha-kpi-tile__cash-debt-key">Карта</span>
                  <span>{kopecksToRubLabel(r.sales.totalCardTransferKopecks || "0")} ₽</span>
                </div>
                <div className="birzha-kpi-tile__cash-debt-row">
                  <span className="birzha-kpi-tile__cash-debt-key">Долг</span>
                  <span>{kopecksToRubLabel(r.sales.totalDebtKopecks)} ₽</span>
                </div>
              </div>
            </div>
          </div>

          <h3 className="birzha-ui-sm" style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>
            Продано по товару и калибру
          </h3>
          {caliberRows.length === 0 ? (
            <BirzhaEmptyState compact title="Продаж по этому рейсу пока нет" description="После продаж строки появятся здесь; подробности — в отчёте по рейсу." />
          ) : (
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={{ ...tableStyle, minWidth: 520 }} aria-label="Продажи по товару и калибру">
                <thead>
                  <tr>
                    <th style={thHead}>Товар · калибр</th>
                    <th style={thHead}>Продано, кг</th>
                    <th style={thHead}>Выручка</th>
                    <th style={thHead}>Нал</th>
                    <th style={thHead}>Карта</th>
                    <th style={thHead}>Долг</th>
                  </tr>
                </thead>
                <tbody>
                  {caliberRows.map((row) => (
                    <tr key={row.lineLabel}>
                      <td style={thtd}>{row.lineLabel}</td>
                      <td style={thtd}>{gramsToKgLabel(row.grams.toString())}</td>
                      <td style={thtd}>{kopecksToRubLabel(row.revenue.toString())} ₽</td>
                      <td style={thtd}>{kopecksToRubLabel(row.cash.toString())} ₽</td>
                      <td style={thtd}>{kopecksToRubLabel(row.card.toString())} ₽</td>
                      <td style={thtd}>{kopecksToRubLabel(row.debt.toString())} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </BirzhaDisclosure>
  );
}
