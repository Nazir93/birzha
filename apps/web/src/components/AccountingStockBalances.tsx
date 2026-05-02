import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BatchListItem, WarehousesListResponse } from "../api/types.js";
import { batchesFullListQueryOptions, warehousesFullListQueryOptions } from "../query/core-list-queries.js";
import { kopecksToRubLabel } from "../format/money.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

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
  const batchesQ = useQuery(batchesFullListQueryOptions());
  const whQ = useQuery(warehousesFullListQueryOptions());

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
    return <LoadingBlock label="Загрузка остатков…" minHeight={72} />;
  }
  if (batchesQ.isError) {
    return (
      <p style={errorText} role="alert">
        Остатки не загрузились. Проверьте связь и повторите.
      </p>
    );
  }

  return (
    <section className="birzha-panel birzha-home-work-card" id="acc-stock" aria-labelledby="acc-stock-h">
      <div className="birzha-section-heading">
        <div>
          <p className="birzha-section-heading__eyebrow">Остатки</p>
          <h3 id="acc-stock-h" className="birzha-section-title birzha-section-title--sm">
            Товар и оценка по закупу
          </h3>
        </div>
        <p className="birzha-section-heading__note">Склад, путь и закупочная стоимость</p>
      </div>
      <div className="birzha-kpi-grid birzha-kpi-grid--wide">
        <div className="birzha-kpi-tile birzha-kpi-tile--premium">
          <div className="birzha-kpi-tile__label">На складе, кг</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {totals.whKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
          </div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium">
          <div className="birzha-kpi-tile__label">Оценка остатка на складе</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{kopecksToRubLabel(totals.valWhKop.toString())}</div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
          <div className="birzha-kpi-tile__label">В пути (в рейсах), кг</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {totals.trKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
          </div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
          <div className="birzha-kpi-tile__label">Оценка товара в пути</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{kopecksToRubLabel(totals.valTrKop.toString())}</div>
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
