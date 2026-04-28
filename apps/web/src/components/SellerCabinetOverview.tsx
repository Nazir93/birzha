import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { apiGetJson } from "../api/fetch-api.js";
import type { BatchesListResponse, TripsListResponse } from "../api/types.js";
import { sales } from "../routes.js";
import { MassBalanceStrip } from "../ui/charts/MassBalanceStrip.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, muted } from "../ui/styles.js";

/**
 * Общая сводка по рейсам и партиям для полевого кабинета (без N отчётов по рейсам).
 */
export function SellerCabinetOverview() {
  const tripsQ = useQuery({
    queryKey: ["trips"],
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    retry: 1,
  });
  const batchesQ = useQuery({
    queryKey: ["batches"],
    queryFn: () => apiGetJson<BatchesListResponse>("/api/batches"),
    retry: 1,
  });

  const summary = useMemo(() => {
    const batches = batchesQ.data?.batches ?? [];
    let warehouseKg = 0;
    let transitKg = 0;
    let soldKg = 0;
    for (const b of batches) {
      warehouseKg += b.onWarehouseKg > 0 ? b.onWarehouseKg : 0;
      transitKg += b.inTransitKg > 0 ? b.inTransitKg : 0;
      soldKg += b.soldKg > 0 ? b.soldKg : 0;
    }
    const trips = tripsQ.data?.trips ?? [];
    let open = 0;
    let closed = 0;
    for (const t of trips) {
      if (t.status === "closed") {
        closed += 1;
      } else {
        open += 1;
      }
    }
    return { tripCount: trips.length, open, closed, batchCount: batches.length, warehouseKg, transitKg, soldKg };
  }, [batchesQ.data?.batches, tripsQ.data?.trips]);

  if (tripsQ.isPending || batchesQ.isPending) {
    return <LoadingBlock label="Загрузка сводки…" minHeight={72} />;
  }

  if (tripsQ.isError || batchesQ.isError) {
    return (
      <p style={muted} role="status">
        Сводка по партиям недоступна. Откройте{" "}
        <Link to={sales.operations} style={{ fontWeight: 600 }}>
          Операции
        </Link>
        .
      </p>
    );
  }

  return (
    <section className="birzha-card" aria-labelledby="seller-overview-h">
      <h3 id="seller-overview-h" className="birzha-section-title birzha-section-title--sm">
        Сводка по системе
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.5, fontSize: "0.9rem" }}>
        Цифры по спискам рейсов и партий; детали по выбранному рейсу — ниже.
      </p>
      <div className="birzha-kpi-grid birzha-kpi-grid--dense" style={{ marginBottom: "0.9rem" }}>
        <div className="birzha-kpi-tile">
          <div className="birzha-kpi-tile__label">Рейсов</div>
          <div className="birzha-kpi-tile__value">{summary.tripCount}</div>
        </div>
        <div className="birzha-kpi-tile">
          <div className="birzha-kpi-tile__label">Открыто</div>
          <div className="birzha-kpi-tile__value">{summary.open}</div>
        </div>
        <div className="birzha-kpi-tile">
          <div className="birzha-kpi-tile__label">Закрыто</div>
          <div className="birzha-kpi-tile__value">{summary.closed}</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--accent">
          <div className="birzha-kpi-tile__label">Партий</div>
          <div className="birzha-kpi-tile__value">{summary.batchCount}</div>
        </div>
      </div>
      <div style={{ marginBottom: "0.65rem" }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.45rem" }}>Масса по партиям</div>
        <MassBalanceStrip warehouseKg={summary.warehouseKg} transitKg={summary.transitKg} soldKg={summary.soldKg} />
      </div>
      <div className="birzha-actions-row">
        <Link to={sales.reports} style={{ ...btnStyle, fontSize: "0.95rem" }}>
          Отчёты
        </Link>
        <Link to={sales.operations} style={{ ...btnStyle, fontSize: "0.95rem" }}>
          Продажи
        </Link>
      </div>
    </section>
  );
}
