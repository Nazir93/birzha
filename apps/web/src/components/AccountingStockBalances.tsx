import { useQuery } from "@tanstack/react-query";

import { stockBalancesQueryOptions, warehousesFullListQueryOptions } from "../query/core-list-queries.js";
import { kopecksToRubLabel } from "../format/money.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

function warehouseLabel(name: string, code: string): string {
  return `${name} (${code})`;
}

/** Остатки товара: кг на складе, погружено в рейс, оценка закупочной стоимости. */
export function AccountingStockBalances() {
  const balancesQ = useQuery(stockBalancesQueryOptions());
  const whQ = useQuery(warehousesFullListQueryOptions());

  if (balancesQ.isPending) {
    return <LoadingBlock label="Загрузка остатков…" minHeight={72} skeleton skeletonRows={6} />;
  }
  if (balancesQ.isError || !balancesQ.data) {
    return (
      <ErrorAlert message="Остатки не загрузились. Проверьте связь и повторите." title="Остатки" />
    );
  }

  const { totals, byWarehouse } = balancesQ.data;

  return (
    <BirzhaDisclosure
      id="acc-stock"
      defaultOpen
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-heading__eyebrow">Остатки</span>
          <span id="acc-stock-h" className="birzha-section-title birzha-section-title--sm">
            Товар и оценка по закупу
          </span>
        </span>
      }
    >
      <div className="birzha-kpi-grid birzha-kpi-grid--wide">
        <div className="birzha-kpi-tile birzha-kpi-tile--premium">
          <div className="birzha-kpi-tile__label">На складе, кг</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {totals.onWarehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
          </div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium">
          <div className="birzha-kpi-tile__label">Оценка остатка на складе</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {kopecksToRubLabel(totals.valueWarehouseKopecks)}
          </div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
          <div className="birzha-kpi-tile__label">Погружено, кг</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {totals.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
          </div>
        </div>
        <div className="birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--amber">
          <div className="birzha-kpi-tile__label">Оценка погруженного, ₽</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {kopecksToRubLabel(totals.valueTransitKopecks)}
          </div>
        </div>
      </div>
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Остатки по складам">
          <thead>
            <tr>
              <th scope="col" style={thHead}>
                Склад поступления (из накладной)
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                На складе, кг
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Оценка остатка, ₽
              </th>
              <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                Погружено, кг
              </th>
            </tr>
          </thead>
          <tbody>
            {byWarehouse.map((row) => (
              <tr key={row.warehouseId}>
                <th scope="row" style={thtd}>
                  {warehouseLabel(row.warehouseName, row.warehouseCode)}
                </th>
                <td style={{ ...thtd, textAlign: "right" }}>
                  {row.onWarehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                </td>
                <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                  {kopecksToRubLabel(row.valueWarehouseKopecks)}
                </td>
                <td style={{ ...thtd, textAlign: "right" }}>
                  {row.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {whQ.isError && (
        <p className="birzha-callout-warning" role="status" style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.82rem" }}>
          Справочник складов не загрузился — названия из сводки API.
        </p>
      )}
    </BirzhaDisclosure>
  );
}
