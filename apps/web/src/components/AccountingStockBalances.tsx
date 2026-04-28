import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiGetJson } from "../api/fetch-api.js";
import type { BatchListItem, BatchesListResponse, WarehousesListResponse } from "../api/types.js";
import { kopecksToRubLabel } from "../format/money.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, sectionBox, tableStyle, thHead, thtd } from "../ui/styles.js";

/** Копейки: кг × руб/кг с округлением по строке партии. */
function inventoryValueKopecks(batches: readonly BatchListItem[], kgOf: (b: BatchListItem) => number): bigint {
  let t = 0n;
  for (const b of batches) {
    const kg = kgOf(b);
    if (!Number.isFinite(kg) || kg <= 0) {
      continue;
    }
    const kop = Math.round(kg * b.pricePerKg * 100);
    if (kop !== 0) {
      t += BigInt(kop);
    }
  }
  return t;
}

function warehouseLabel(
  warehouses: WarehousesListResponse["warehouses"] | undefined,
  id: string | null | undefined,
): string {
  if (!id || !warehouses) {
    return "Склад не указан в строке";
  }
  const w = warehouses.find((x) => x.id === id);
  return w ? `${w.name} (${w.code})` : id;
}

/**
 * Остатки товара в штуках учёта: кг на складе, в пути, оценка закупочной стоимости по цене партии из накладной.
 */
export function AccountingStockBalances() {
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

  const totals = useMemo(() => {
    const batches = batchesQ.data?.batches ?? [];
    let whKg = 0;
    let trKg = 0;
    for (const b of batches) {
      if (Number.isFinite(b.onWarehouseKg) && b.onWarehouseKg > 0) {
        whKg += b.onWarehouseKg;
      }
      if (Number.isFinite(b.inTransitKg) && b.inTransitKg > 0) {
        trKg += b.inTransitKg;
      }
    }
    const valWhKop = inventoryValueKopecks(batches, (b) => b.onWarehouseKg);
    const valTrKop = inventoryValueKopecks(batches, (b) => b.inTransitKg);
    return { whKg, trKg, valWhKop, valTrKop, batchCount: batches.length };
  }, [batchesQ.data?.batches]);

  const byWarehouse = useMemo(() => {
    const batches = batchesQ.data?.batches ?? [];
    const m = new Map<
      string,
      { warehouseId: string | null; whKg: number; trKg: number; valWhKop: bigint; lines: number }
    >();
    for (const b of batches) {
      const wid = b.nakladnaya?.warehouseId?.trim() || null;
      const key = wid ?? "_none";
      if (!m.has(key)) {
        m.set(key, { warehouseId: wid, whKg: 0, trKg: 0, valWhKop: 0n, lines: 0 });
      }
      const row = m.get(key)!;
      row.lines += 1;
      if (Number.isFinite(b.onWarehouseKg) && b.onWarehouseKg > 0) {
        row.whKg += b.onWarehouseKg;
        const kop = Math.round(b.onWarehouseKg * b.pricePerKg * 100);
        if (kop !== 0) {
          row.valWhKop += BigInt(kop);
        }
      }
      if (Number.isFinite(b.inTransitKg) && b.inTransitKg > 0) {
        row.trKg += b.inTransitKg;
      }
    }
    return [...m.entries()]
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => {
        const la = warehouseLabel(whQ.data?.warehouses, a.warehouseId);
        const lb = warehouseLabel(whQ.data?.warehouses, b.warehouseId);
        return la.localeCompare(lb, "ru");
      });
  }, [batchesQ.data?.batches, whQ.data?.warehouses]);

  if (batchesQ.isPending) {
    return <LoadingBlock label="Загрузка остатков (GET /api/batches)…" minHeight={72} />;
  }
  if (batchesQ.isError) {
    return (
      <p style={errorText} role="alert">
        Остатки не загрузились. Проверьте API.
      </p>
    );
  }

  return (
    <section style={sectionBox} id="acc-stock" aria-labelledby="acc-stock-h">
      <h3 id="acc-stock-h" style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>
        Остатки товара и оценка по закупу
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        Данные из движений партий: <strong>на складе</strong> и <strong>в пути</strong> (отгружено в рейс, ещё не
        продано). Оценка — по <strong>цене закупа руб/кг</strong> из партии (как в отчёте по рейсу); доп. расходы по шапке
        накладной в этой оценке не делятся на кг.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
          gap: "0.65rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ padding: "0.65rem 0.75rem", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b" }}>На складе, кг</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{totals.whKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</div>
        </div>
        <div style={{ padding: "0.65rem 0.75rem", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Оценка остатка на складе</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{kopecksToRubLabel(totals.valWhKop.toString())}</div>
        </div>
        <div style={{ padding: "0.65rem 0.75rem", background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: "0.78rem", color: "#92400e" }}>В пути (в рейсах), кг</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{totals.trKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</div>
        </div>
        <div style={{ padding: "0.65rem 0.75rem", background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: "0.78rem", color: "#92400e" }}>Оценка товара в пути</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{kopecksToRubLabel(totals.valTrKop.toString())}</div>
        </div>
      </div>
      <p style={{ ...muted, fontSize: "0.82rem", margin: "0 0 0.65rem" }}>
        Всего партий в списке API: <strong>{totals.batchCount}</strong>.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...tableStyle, minWidth: 560, fontSize: "0.88rem" }} aria-label="Остатки по складам">
          <thead>
            <tr>
              <th scope="col" style={thHead}>
                Склад поступления (из накладной)
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Партий
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                На складе, кг
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Оценка остатка, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                В пути, кг
              </th>
            </tr>
          </thead>
          <tbody>
            {byWarehouse.map((row) => (
              <tr key={row.key}>
                <th scope="row" style={thtd}>
                  {warehouseLabel(whQ.data?.warehouses, row.warehouseId)}
                </th>
                <td style={{ ...thtd, textAlign: "right" }}>{row.lines}</td>
                <td style={{ ...thtd, textAlign: "right" }}>
                  {row.whKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                </td>
                <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                  {kopecksToRubLabel(row.valWhKop.toString())}
                </td>
                <td style={{ ...thtd, textAlign: "right" }}>
                  {row.trKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {whQ.isError && (
        <p style={{ ...muted, marginTop: "0.5rem", fontSize: "0.82rem" }} role="status">
          Справочник складов не загрузился — в первой колонке показаны id.
        </p>
      )}
    </section>
  );
}
