import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiGetJson } from "../api/fetch-api.js";
import type { BatchesListResponse, TripsListResponse, WarehousesListResponse } from "../api/types.js";
import { adminRoutes, ops, prefix } from "../routes.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, muted, sectionBox } from "../ui/styles.js";

/**
 * Сводка для администратора: KPI из публичных GET и ссылки в разделы `/a` и `/o`.
 */
export function AdminCabinetHome() {
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
  const whQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiGetJson<WarehousesListResponse>("/api/warehouses"),
    retry: 1,
  });

  const kpis = (() => {
    const batches = batchesQ.data?.batches ?? [];
    let whKg = 0;
    let transitKg = 0;
    for (const b of batches) {
      if (b.onWarehouseKg > 0) {
        whKg += b.onWarehouseKg;
      }
      if (b.inTransitKg > 0) {
        transitKg += b.inTransitKg;
      }
    }
    return {
      tripCount: tripsQ.data?.trips.length ?? 0,
      batchCount: batches.length,
      warehouseKg: whKg,
      transitKg,
      warehouseCatalogCount: whQ.data?.warehouses.length ?? 0,
    };
  })();

  const loading = tripsQ.isPending || batchesQ.isPending || whQ.isPending;
  const err = tripsQ.isError || batchesQ.isError || whQ.isError;

  return (
    <section style={sectionBox} aria-labelledby="admin-dash-h">
      <h2 id="admin-dash-h" style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>
        Сводка
      </h2>
      <p style={{ ...muted, margin: "0 0 1rem", lineHeight: 1.55 }}>
        Быстрый обзор по данным API. Детальные отчёты и операции — в кабинете <Link to={prefix.operations}>{prefix.operations}</Link>
        ; справочники ниже.
      </p>
      {loading && <LoadingBlock label="Загрузка сводки…" minHeight={80} />}
      {err && (
        <p role="alert" style={errorText}>
          Часть данных не загрузилась. Проверьте API.
        </p>
      )}
      {!loading && !err && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))",
            gap: "0.65rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ padding: "0.65rem 0.75rem", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Рейсов в системе</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{kpis.tripCount}</div>
          </div>
          <div style={{ padding: "0.65rem 0.75rem", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Партий (строк)</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{kpis.batchCount}</div>
          </div>
          <div style={{ padding: "0.65rem 0.75rem", background: "#ecfdf5", borderRadius: 6, border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: "0.78rem", color: "#166534" }}>Остаток на складах, кг</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              {kpis.warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: "0.65rem 0.75rem", background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a" }}>
            <div style={{ fontSize: "0.78rem", color: "#92400e" }}>В пути (рейсы), кг</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              {kpis.transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: "0.65rem 0.75rem", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Складов в справочнике</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{kpis.warehouseCatalogCount}</div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <Link to={adminRoutes.inventory} style={btnStyle}>
          Склады и калибры
        </Link>
        <Link to={adminRoutes.service} style={btnStyle}>
          Служебное (meta)
        </Link>
        <Link to={ops.reports} style={btnStyle}>
          Отчёты и рейсы (/o)
        </Link>
        <Link to={ops.purchaseNakladnaya} style={btnStyle}>
          Накладная (/o)
        </Link>
      </div>
    </section>
  );
}
