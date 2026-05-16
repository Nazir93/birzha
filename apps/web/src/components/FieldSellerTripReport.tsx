import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import {
  aggregateTripSalesByProductLine,
  type TripSalesByProductLineRow,
} from "../format/aggregate-trip-sales-by-product-line.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

function sumSalesByProductLine(rows: TripSalesByProductLineRow[]) {
  let grams = 0n;
  let cash = 0n;
  let card = 0n;
  let debt = 0n;
  for (const row of rows) {
    grams += row.grams;
    cash += row.cash;
    card += row.card;
    debt += row.debt;
  }
  return { grams, cash, card, debt };
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
  const card = typeof cardKopecks === "bigint" ? cardKopecks.toString() : cardKopecks || "0";
  const debt = typeof debtKopecks === "bigint" ? debtKopecks.toString() : debtKopecks;
  return (
    <>
      <td style={thtd}>{kopecksToRubLabel(cash)} ₽</td>
      <td style={thtd}>{kopecksToRubLabel(card)} ₽</td>
      <td style={thtd}>{kopecksToRubLabel(debt)} ₽</td>
    </>
  );
}

const payHead = (
  <>
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

export function FieldSellerTripReport({
  report,
  batchById,
}: {
  report: ShipmentReportResponse;
  batchById: Map<string, BatchListItem>;
}) {
  const salesByProductLine = aggregateTripSalesByProductLine(report, batchById);
  const caliberTotals = sumSalesByProductLine(salesByProductLine);
  const { sales } = report;

  return (
    <div style={{ marginTop: "1rem" }} role="region" aria-label={`Отчёт ${report.trip.tripNumber}`}>
      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
        Продано по калибрам
      </h3>
      {salesByProductLine.length === 0 ? (
        <BirzhaEmptyState compact title="Нет продаж" />
      ) : (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "1rem" }}>
          <table style={{ ...tableStyle, minWidth: 480 }} aria-label="Продано по калибрам">
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

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
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
              <PaymentCells
                cashKopecks={sales.totalCashKopecks}
                cardKopecks={sales.totalCardTransferKopecks}
                debtKopecks={sales.totalDebtKopecks}
              />
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
        Кому продано
      </h3>
      {sales.byClient.length === 0 ? (
        <BirzhaEmptyState compact title="Нет продаж по клиентам" />
      ) : (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
          <table style={{ ...tableStyle, minWidth: 480 }} aria-label="Кому продано">
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
              {sales.byClient.map((row, idx) => (
                <tr key={`${row.clientLabel}-${idx}`}>
                  <td style={thtd}>{row.clientLabel?.trim() ? row.clientLabel : "—"}</td>
                  <td style={thtd}>{gramsToKgLabel(row.grams)}</td>
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
    </div>
  );
}
