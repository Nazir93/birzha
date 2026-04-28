import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiGetJson } from "../api/fetch-api.js";
import type { ShipmentReportResponse, TripsListResponse } from "../api/types.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { QUERY_STALE_SHIPMENT_REPORT_MS } from "../query/query-defaults.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { sales } from "../routes.js";
import { btnStyle, errorText, muted } from "../ui/styles.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";

/**
 * Главная полевого кабинета: выбор рейса, краткие цифры по отчёту, быстрые кнопки.
 */
export function SalesCabinetDashboard() {
  const { user } = useAuth();
  const fieldOnly = user ? isFieldSellerOnly(user) : false;

  const tripsQ = useQuery({
    queryKey: ["trips"],
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    retry: 1,
  });

  const sortedTrips = useMemo(() => {
    return [...(tripsQ.data?.trips ?? [])].sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
  }, [tripsQ.data?.trips]);

  const [tripId, setTripId] = useState("");

  useEffect(() => {
    if (!tripId && sortedTrips.length > 0) {
      setTripId(sortedTrips[sortedTrips.length - 1]!.id);
    }
  }, [tripId, sortedTrips]);

  const reportQ = useQuery({
    queryKey: ["shipment-report", tripId],
    queryFn: () => apiGetJson<ShipmentReportResponse>(`/api/trips/${encodeURIComponent(tripId)}/shipment-report`),
    enabled: tripId.length > 0,
    retry: 1,
    staleTime: QUERY_STALE_SHIPMENT_REPORT_MS,
  });

  const summary = reportQ.data
    ? {
        soldKg: gramsToKgLabel(reportQ.data.sales.totalGrams),
        revenue: kopecksToRubLabel(reportQ.data.sales.totalRevenueKopecks),
        shippedKg: gramsToKgLabel(reportQ.data.shipment.totalGrams),
        tripNumber: reportQ.data.trip.tripNumber,
      }
    : null;

  if (tripsQ.isPending) {
    return <LoadingBlock label="Загрузка рейсов…" minHeight={88} />;
  }

  if (tripsQ.isError || sortedTrips.length === 0) {
    return (
      <div className="birzha-card">
        <p style={muted}>
          Рейсов пока нет. После того как логист создаст рейс и склад отгрузит товар, здесь появятся цифры. Пока можно
          открыть{" "}
          <Link to={sales.operations} style={{ fontWeight: 600 }}>
            Операции
          </Link>{" "}
          после появления отгрузки.
        </p>
      </div>
    );
  }

  return (
    <div className="birzha-stack">
      <section className="birzha-card" aria-labelledby="sales-dash-trip">
        <h3 id="sales-dash-trip" className="birzha-section-title birzha-section-title--sm">
          Рейс
        </h3>
        <label htmlFor="sales-dash-sel-trip" style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.35rem" }}>
          Выберите рейс
        </label>
        <select
          id="sales-dash-sel-trip"
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          style={{ width: "100%", maxWidth: "28rem", padding: "0.45rem 0.5rem", fontSize: "1rem" }}
        >
          {sortedTrips.map((t) => (
            <option key={t.id} value={t.id}>
              {formatTripSelectLabel(t)}
            </option>
          ))}
        </select>
        {fieldOnly && (
          <p style={{ ...muted, fontSize: "0.86rem", marginTop: "0.5rem", lineHeight: 1.45 }}>
            Для вашего входа в блоке «Продажи» отчёта учитываются <strong>только ваши</strong> строки продажи; отгрузка и
            недостача по рейсу — общие.
          </p>
        )}
      </section>

      {tripId && reportQ.isPending && <LoadingBlock label="Загрузка отчёта рейса…" minHeight={64} />}
      {tripId && reportQ.isError && (
        <p style={errorText} role="alert">
          Отчёт не загрузился. Попробуйте позже или откройте «Отчёты и рейсы».
        </p>
      )}
      {summary && reportQ.isSuccess && (
        <section className="birzha-card" aria-label="Кратко по выбранному рейсу">
          <div className="birzha-kpi-grid birzha-kpi-grid--dense">
            <div className="birzha-kpi-tile birzha-kpi-tile--accent">
              <div className="birzha-kpi-tile__label">Рейс</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{summary.tripNumber}</div>
            </div>
            <div className="birzha-kpi-tile">
              <div className="birzha-kpi-tile__label">Отгружено в рейс</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{summary.shippedKg} кг</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--blue">
              <div className="birzha-kpi-tile__label">
                {fieldOnly ? "Продано (ваши строки)" : "Продано"}
              </div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{summary.soldKg} кг</div>
            </div>
            <div className="birzha-kpi-tile birzha-kpi-tile--amber">
              <div className="birzha-kpi-tile__label">Выручка</div>
              <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{summary.revenue}</div>
            </div>
          </div>
        </section>
      )}

      <section className="birzha-card" aria-label="Быстрые действия">
        <h3 className="birzha-section-title birzha-section-title--sm">Действия</h3>
        <div className="birzha-actions-row">
          <Link to={sales.operations} style={{ ...btnStyle, fontSize: "1rem", padding: "0.65rem 1rem" }}>
            Продать с рейса
          </Link>
          <Link to={sales.offline} style={{ ...btnStyle, fontSize: "1rem", padding: "0.65rem 1rem" }}>
            Офлайн-очередь
          </Link>
          <Link to={sales.reports} style={{ ...btnStyle, fontSize: "1rem", padding: "0.65rem 1rem" }}>
            Отчёты и печать
          </Link>
        </div>
      </section>
    </div>
  );
}
