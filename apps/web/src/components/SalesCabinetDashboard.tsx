import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiGetJson } from "../api/fetch-api.js";
import type { ShipmentReportResponse, TripsListResponse } from "../api/types.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import { sales } from "../routes.js";
import { btnStyle, muted, sectionBox } from "../ui/styles.js";
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
    staleTime: 15_000,
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
      <div style={sectionBox}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section style={sectionBox} aria-labelledby="sales-dash-trip">
        <h3 id="sales-dash-trip" style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
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
        <p style={{ color: "#b91c1c" }} role="alert">
          Отчёт не загрузился. Попробуйте позже или откройте «Отчёты и рейсы».
        </p>
      )}
      {summary && reportQ.isSuccess && (
        <section
          style={{
            ...sectionBox,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))",
            gap: "0.65rem",
          }}
          aria-label="Кратко по выбранному рейсу"
        >
          <div style={{ padding: "0.65rem", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: "0.75rem", color: "#166534" }}>Рейс</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{summary.tripNumber}</div>
          </div>
          <div style={{ padding: "0.65rem", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Отгружено в рейс</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{summary.shippedKg} кг</div>
          </div>
          <div style={{ padding: "0.65rem", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <div style={{ fontSize: "0.75rem", color: "#1e40af" }}>
              {fieldOnly ? "Продано (ваши строки)" : "Продано"}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{summary.soldKg} кг</div>
          </div>
          <div style={{ padding: "0.65rem", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
            <div style={{ fontSize: "0.75rem", color: "#92400e" }}>Выручка</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{summary.revenue}</div>
          </div>
        </section>
      )}

      <section style={sectionBox} aria-label="Быстрые действия">
        <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Действия</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
