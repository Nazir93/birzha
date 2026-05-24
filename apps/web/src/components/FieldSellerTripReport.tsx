import { useMemo, useState } from "react";

import { useAuth } from "../auth/auth-context.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import {
  aggregateTripSalesByProductLine,
  type TripSalesByProductLineRow,
} from "../format/aggregate-trip-sales-by-product-line.js";
import { gramsToKgLabel, kopecksToRubLabelSafe } from "../format/money.js";
import {
  formatTripSaleClientDisplayLabel,
  salesChannelTotals,
  salesClientLinesForChannel,
  shouldShowSalesClientTable,
  type SaleChannelFilter,
} from "../format/trip-sales-channel.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { SellerSaleChannelPills } from "./SellerSaleChannelPills.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

function sumSalesByProductLine(rows: TripSalesByProductLineRow[]) {
  let grams = 0n;
  let revenue = 0n;
  let cash = 0n;
  let card = 0n;
  let debt = 0n;
  for (const row of rows) {
    grams += row.grams;
    revenue += row.revenue;
    cash += row.cash;
    card += row.card;
    debt += row.debt;
  }
  return { grams, revenue, cash, card, debt };
}

function PaymentCells({
  cashKopecks,
  cardKopecks,
  debtKopecks,
}: {
  cashKopecks: string | bigint;
  cardKopecks: string | bigint;
  debtKopecks: string | bigint;
}) {
  const cash = typeof cashKopecks === "bigint" ? cashKopecks.toString() : cashKopecks;
  const card = typeof cardKopecks === "bigint" ? cardKopecks.toString() : cardKopecks;
  const debt = typeof debtKopecks === "bigint" ? debtKopecks.toString() : debtKopecks;
  return (
    <>
      <td style={thtd}>{kopecksToRubLabelSafe(cash)} ₽</td>
      <td style={thtd}>{kopecksToRubLabelSafe(card)} ₽</td>
      <td style={thtd}>{kopecksToRubLabelSafe(debt)} ₽</td>
    </>
  );
}

const payHead = (
  <>
    <th scope="col" style={thHead}>
      Выручка
    </th>
    <th scope="col" style={thHead}>
      Нал
    </th>
    <th scope="col" style={thHead}>
      Карта
    </th>
    <th scope="col" style={thHead}>
      Долг
    </th>
  </>
);

function ChannelSummaryStrip({ channel, sales }: { channel: SaleChannelFilter; sales: ShipmentReportResponse["sales"] }) {
  const t = salesChannelTotals(sales, channel);
  const label = channel === "all" ? "Всего" : channel === "retail" ? "Розница" : "Опт";
  return (
    <div
      className="birzha-callout-info"
      style={{ marginBottom: "1rem", display: "grid", gap: "0.35rem", fontSize: "0.92rem" }}
      role="status"
    >
      <strong>{label}</strong>
      <span>
        Продано: <strong>{gramsToKgLabel(t.grams)}</strong> кг · выручка{" "}
        <strong>{kopecksToRubLabelSafe(t.revenueKopecks)} ₽</strong>
      </span>
      <span className="birzha-text-muted birzha-ui-sm">
        Оплата: нал {kopecksToRubLabelSafe(t.cashKopecks)} ₽ · карта {kopecksToRubLabelSafe(t.cardTransferKopecks)} ₽ · долг{" "}
        {kopecksToRubLabelSafe(t.debtKopecks)} ₽
      </span>
    </div>
  );
}

export function FieldSellerTripReport({
  report,
  batchById,
}: {
  report: ShipmentReportResponse;
  batchById: Map<string, BatchListItem>;
}) {
  const { meta } = useAuth();
  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const [channel, setChannel] = useState<SaleChannelFilter>("all");
  const { sales } = report;

  const salesByProductLine = useMemo(
    () => aggregateTripSalesByProductLine(report, batchById, channel),
    [report, batchById, channel],
  );
  const clientLines = useMemo(() => salesClientLinesForChannel(sales, channel), [sales, channel]);
  const caliberTotals = sumSalesByProductLine(salesByProductLine);

  const hasWholesale = sales.wholesaleGrams !== "0" && sales.wholesaleGrams !== "";
  const hasRetail = sales.retailGrams !== "0" && sales.retailGrams !== "";

  return (
    <div style={{ marginTop: "1rem" }} role="region" aria-label={`Отчёт ${report.trip.tripNumber}`}>
      <h3 className="birzha-form-label" style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
        Анализ продаж
      </h3>
      <SellerSaleChannelPills
        value={channel}
        onChange={setChannel}
        wholesaleDisabled={!wholesalersCatalog}
        wholesaleDisabledTitle="Справочник оптовиков недоступен"
      />

      {channel !== "all" ? <ChannelSummaryStrip channel={channel} sales={sales} /> : null}

      {channel === "all" ? (
        <>
          <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
            Как продано
          </h3>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "1rem" }}>
            <table style={tableStyle} aria-label="Как продано">
              <thead>
                <tr>
                  <th scope="col" style={thHead} />
                  <th scope="col" style={thHead}>
                    кг
                  </th>
                  {payHead}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" style={thtd}>
                    Розница
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.retailGrams)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.retailRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.retailCashKopecks}
                    cardKopecks={sales.retailCardTransferKopecks}
                    debtKopecks={sales.retailDebtKopecks}
                  />
                </tr>
                <tr>
                  <th scope="row" style={thtd}>
                    Опт
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.wholesaleGrams)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.wholesaleRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.wholesaleCashKopecks}
                    cardKopecks={sales.wholesaleCardTransferKopecks}
                    debtKopecks={sales.wholesaleDebtKopecks}
                  />
                </tr>
                <tr className="birzha-table-subtotal-row">
                  <th scope="row" style={thtd}>
                    Итого
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.totalGrams)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.totalRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.totalCashKopecks}
                    cardKopecks={sales.totalCardTransferKopecks}
                    debtKopecks={sales.totalDebtKopecks}
                  />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
        {channel === "all" ? "Продано по калибрам" : channel === "retail" ? "Розница по калибрам" : "Опт по калибрам"}
      </h3>
      {salesByProductLine.length === 0 ? (
        <BirzhaEmptyState
          compact
          title={channel === "wholesale" && !hasWholesale ? "Нет оптовых продаж" : channel === "retail" && !hasRetail ? "Нет розничных продаж" : "Нет продаж"}
        />
      ) : (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "1rem" }}>
          <table style={{ ...tableStyle, minWidth: 520 }} aria-label="Продано по калибрам">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Калибр
                </th>
                <th scope="col" style={thHead}>
                  кг
                </th>
                {payHead}
              </tr>
            </thead>
            <tbody>
              {salesByProductLine.map((row) => (
                <tr key={row.lineLabel}>
                  <td style={thtd}>{row.lineLabel}</td>
                  <td style={thtd}>{gramsToKgLabel(row.grams.toString())}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(row.revenue.toString())} ₽</td>
                  <PaymentCells cashKopecks={row.cash} cardKopecks={row.card} debtKopecks={row.debt} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="birzha-table-subtotal-row">
                <th scope="row" style={thtd}>
                  Итого
                </th>
                <td style={thtd}>{gramsToKgLabel(caliberTotals.grams.toString())}</td>
                <td style={thtd}>{kopecksToRubLabelSafe(caliberTotals.revenue.toString())} ₽</td>
                <PaymentCells
                  cashKopecks={caliberTotals.cash}
                  cardKopecks={caliberTotals.card}
                  debtKopecks={caliberTotals.debt}
                />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {shouldShowSalesClientTable(channel) ? (
        <>
          <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
            {channel === "all" ? "Кому продано" : "Опт — кому"}
          </h3>
          {clientLines.length === 0 ? (
            <BirzhaEmptyState compact title="Нет продаж по клиентам" />
          ) : (
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={{ ...tableStyle, minWidth: 520 }} aria-label="Кому продано">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Кому
                    </th>
                    <th scope="col" style={thHead}>
                      кг
                    </th>
                    {payHead}
                  </tr>
                </thead>
                <tbody>
                  {clientLines.map((row, idx) => (
                    <tr key={`${row.clientLabel}-${idx}`}>
                      <td style={thtd}>{formatTripSaleClientDisplayLabel(row.clientLabel, channel)}</td>
                      <td style={thtd}>{gramsToKgLabel(row.grams)}</td>
                      <td style={thtd}>{kopecksToRubLabelSafe(row.revenueKopecks)} ₽</td>
                      <PaymentCells
                        cashKopecks={row.cashKopecks}
                        cardKopecks={row.cardTransferKopecks}
                        debtKopecks={row.debtKopecks}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
