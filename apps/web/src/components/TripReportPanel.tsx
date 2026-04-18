import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { apiGetJson } from "../api/fetch-api.js";
import type { ShipmentReportResponse, TripsListResponse } from "../api/types.js";
import { tripBatchRowsToCsv } from "../format/csv.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import {
  aggregateTripBatchRows,
  buildTripBatchRows,
  reconcileBatchTotalsWithReport,
} from "../format/trip-report-rows.js";
import {
  btnSecondary,
  errorText,
  fieldStyleFullWidth,
  muted,
  preJson,
  tableStyle,
  thHead,
  thtd,
} from "../ui/styles.js";

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
}

export function TripReportPanel() {
  const [tripId, setTripId] = useState<string | "">("");

  const tripsQuery = useQuery({
    queryKey: ["trips"],
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    retry: 1,
  });

  const sortedTrips = useMemo(() => {
    const list = tripsQuery.data?.trips ?? [];
    return [...list].sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
  }, [tripsQuery.data?.trips]);

  const reportQuery = useQuery({
    queryKey: ["shipment-report", tripId],
    queryFn: () => apiGetJson<ShipmentReportResponse>(`/api/trips/${tripId}/shipment-report`),
    enabled: Boolean(tripId),
    retry: 1,
  });

  const r = reportQuery.data;

  const batchRows = useMemo(() => (r ? buildTripBatchRows(r) : []), [r]);

  const batchAgg = useMemo(() => aggregateTripBatchRows(batchRows), [batchRows]);

  const reconciliation = useMemo(
    () => (r ? reconcileBatchTotalsWithReport(r, batchAgg) : null),
    [r, batchAgg],
  );

  const reconciliationIssues = useMemo(() => {
    if (!reconciliation) {
      return [];
    }
    const issues: string[] = [];
    if (!reconciliation.shipmentGramsOk) {
      issues.push("сумма отгрузки по партиям ≠ total отгрузки");
    }
    if (!reconciliation.salesGramsOk) {
      issues.push("сумма продаж по партиям ≠ total продаж");
    }
    if (!reconciliation.shortageGramsOk) {
      issues.push("сумма недостач по партиям ≠ total недостачи");
    }
    if (!reconciliation.revenueKopecksOk) {
      issues.push("сумма выручки по партиям ≠ total выручки");
    }
    if (!reconciliation.cashDebtOk) {
      issues.push("нал / долг по партиям ≠ итогам рейса");
    }
    if (!reconciliation.clientTotalsOk) {
      issues.push("суммы по клиентам ≠ итогам продаж рейса");
    }
    return issues;
  }, [reconciliation]);

  const downloadBatchCsv = useCallback(() => {
    if (!r || batchRows.length === 0) {
      return;
    }
    const csv = tripBatchRowsToCsv(batchRows, { tripNumber: r.trip.tripNumber, tripId: r.trip.id });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilenamePart(`birzha-${r.trip.tripNumber}`)}-partii.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [r, batchRows]);

  const printReport = useCallback(() => {
    window.print();
  }, []);

  return (
    <div role="region" aria-labelledby="trip-report-heading">
      <h2 id="trip-report-heading" style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
        Рейсы и отчёт по фуре
      </h2>
      <p className="no-print" style={muted}>
        Список из <code>GET /api/trips</code>, отчёт — <code>GET /api/trips/:tripId/shipment-report</code> (отгрузки,
        продажи, недостача, деньги).
      </p>

      {tripsQuery.isPending && (
        <p className="no-print" role="status" aria-live="polite" style={{ ...muted, marginTop: "0.35rem", marginBottom: 0 }}>
          Загрузка рейсов…
        </p>
      )}
      {tripsQuery.isError && (
        <p className="no-print" role="alert" style={errorText}>
          Не удалось загрузить рейсы — запустите API.
        </p>
      )}

      {tripsQuery.data && sortedTrips.length === 0 && (
        <p className="no-print" style={{ ...muted, marginTop: "0.5rem" }}>
          Рейсов пока нет — создайте через API или офлайн-очередь.
        </p>
      )}

      {sortedTrips.length > 0 && (
        <div className="no-print" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="trip-select" style={{ ...muted, display: "block", marginBottom: "0.35rem" }}>
            Выберите рейс
          </label>
          <select id="trip-select" value={tripId} onChange={(e) => setTripId(e.target.value)} style={fieldStyleFullWidth}>
            <option value="">—</option>
            {sortedTrips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tripNumber} ({t.status}) — {t.id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>
      )}

      {tripId && reportQuery.isPending && (
        <p className="no-print" role="status" aria-live="polite" style={{ ...muted, marginTop: "0.75rem", marginBottom: 0 }}>
          Загрузка отчёта…
        </p>
      )}
      {tripId && reportQuery.isError && (
        <p className="no-print" role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
          Отчёт недоступен (рейс не найден или ошибка API).
        </p>
      )}

      {r && (
        <div style={{ marginTop: "1rem" }} role="region" aria-label={`Отчёт по рейсу ${r.trip.tripNumber}`}>
          <p
            style={{
              margin: "0 0 0.5rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>
              <strong>{r.trip.tripNumber}</strong> · статус: <code>{r.trip.status}</code>
            </span>
            <button
              type="button"
              className="no-print"
              style={btnSecondary}
              onClick={printReport}
              aria-label="Открыть диалог печати отчёта по рейсу"
            >
              Печать
            </button>
          </p>

          <h3 id="trip-report-masses" style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.25rem" }}>
            Массы, кг (из граммов)
          </h3>
          <table style={tableStyle} aria-labelledby="trip-report-masses">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Показатель
                </th>
                <th scope="col" style={thHead}>
                  Всего
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd}>Отгрузка в рейс</td>
                <td style={thtd}>{gramsToKgLabel(r.shipment.totalGrams)} кг</td>
              </tr>
              <tr>
                <td style={thtd}>Продажи</td>
                <td style={thtd}>{gramsToKgLabel(r.sales.totalGrams)} кг</td>
              </tr>
              <tr>
                <td style={thtd}>Недостача (фикс.)</td>
                <td style={thtd}>{gramsToKgLabel(r.shortage.totalGrams)} кг</td>
              </tr>
            </tbody>
          </table>

          <h3 id="trip-report-money" style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.25rem" }}>
            Деньги (копейки → руб.)
          </h3>
          <table style={tableStyle} aria-labelledby="trip-report-money">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Показатель
                </th>
                <th scope="col" style={thHead}>
                  Сумма
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd}>Выручка</td>
                <td style={thtd}>{kopecksToRubLabel(r.financials.revenueKopecks)} ₽</td>
              </tr>
              <tr>
                <td style={thtd}>Себестоимость проданного</td>
                <td style={thtd}>{kopecksToRubLabel(r.financials.costOfSoldKopecks)} ₽</td>
              </tr>
              <tr>
                <td style={thtd}>Себестоимость недостачи</td>
                <td style={thtd}>{kopecksToRubLabel(r.financials.costOfShortageKopecks)} ₽</td>
              </tr>
              <tr>
                <td style={thtd}>
                  <strong>Валовая прибыль</strong>
                </td>
                <td style={thtd}>
                  <strong>{kopecksToRubLabel(r.financials.grossProfitKopecks)} ₽</strong>
                </td>
              </tr>
              <tr>
                <td style={thtd}>Выручка: нал / долг</td>
                <td style={thtd}>
                  {kopecksToRubLabel(r.sales.totalCashKopecks)} ₽ / {kopecksToRubLabel(r.sales.totalDebtKopecks)} ₽
                </td>
              </tr>
            </tbody>
          </table>

          {r.sales.byClient.length > 0 && (
            <>
              <h3 id="trip-report-clients" style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.25rem" }}>
                Продажи по клиентам
              </h3>
              <p className="no-print" style={{ ...muted, margin: "0 0 0.35rem", fontSize: "0.85rem" }}>
                Подпись указывается при продаже с рейса; строка «—» — продажи без метки.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle} aria-labelledby="trip-report-clients">
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        Клиент
                      </th>
                      <th scope="col" style={thHead}>
                        Прод., кг
                      </th>
                      <th scope="col" style={thHead}>
                        Выручка
                      </th>
                      <th scope="col" style={thHead}>
                        Нал / долг
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sales.byClient.map((row, idx) => (
                      <tr key={`${row.clientLabel}-${idx}`}>
                        <td style={thtd}>{row.clientLabel ? row.clientLabel : "—"}</td>
                        <td style={thtd}>{gramsToKgLabel(row.grams)}</td>
                        <td style={thtd}>{kopecksToRubLabel(row.revenueKopecks)} ₽</td>
                        <td style={thtd}>
                          {kopecksToRubLabel(row.cashKopecks)} / {kopecksToRubLabel(row.debtKopecks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0.35rem",
              margin: "0.75rem 0 0.25rem",
            }}
          >
            <h3 id="trip-report-batches" style={{ fontSize: "0.95rem", margin: 0 }}>
              Сверка по партиям
            </h3>
            {batchRows.length > 0 && (
              <button
                type="button"
                className="no-print"
                style={btnSecondary}
                onClick={downloadBatchCsv}
                aria-label="Скачать таблицу сверки по партиям в CSV для Excel"
              >
                Скачать CSV (Excel)
              </button>
            )}
          </div>
          <p className="no-print" style={{ ...muted, margin: "0 0 0.35rem" }}>
            Отгрузка, продажи и недостача по каждой партии; «остаток в пути» = отгружено − продано − недостача (как в
            учёте рейса). Отрицательный остаток подсвечен — перепродажа или ошибка ввода.
          </p>
          {reconciliationIssues.length > 0 && (
            <p
              role="status"
              style={{
                margin: "0 0 0.5rem",
                padding: "0.5rem 0.65rem",
                fontSize: "0.85rem",
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                borderRadius: 6,
                color: "#92400e",
              }}
            >
              <strong>Сверка строк с итогами:</strong> {reconciliationIssues.join("; ")} — проверьте данные или
              сообщите разработчикам.
            </p>
          )}
          {batchRows.length === 0 ? (
            <p style={{ ...muted, margin: 0 }}>Нет строк в разбивке по партиям — по этому рейсу ещё нет операций.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle} aria-labelledby="trip-report-batches">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Партия
                    </th>
                    <th scope="col" style={thHead}>
                      Отгр., кг
                    </th>
                    <th scope="col" style={thHead}>
                      Прод., кг
                    </th>
                    <th scope="col" style={thHead}>
                      Недост., кг
                    </th>
                    <th scope="col" style={thHead}>
                      Остаток в пути, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Выручка
                    </th>
                    <th scope="col" style={thHead}>
                      Нал / долг
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row) => (
                    <tr key={row.batchId}>
                      <td style={thtd}>
                        <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{row.batchId}</code>
                      </td>
                      <td style={thtd}>{gramsToKgLabel(row.shippedG.toString())}</td>
                      <td style={thtd}>{gramsToKgLabel(row.soldG.toString())}</td>
                      <td style={thtd}>{gramsToKgLabel(row.shortageG.toString())}</td>
                      <td
                        style={{
                          ...thtd,
                          ...(row.netTransitG < 0n ? { color: "#b91c1c", fontWeight: 600 } : {}),
                        }}
                      >
                        {gramsToKgLabel(row.netTransitG.toString())}
                      </td>
                      <td style={thtd}>{kopecksToRubLabel(row.revenueK.toString())} ₽</td>
                      <td style={thtd}>
                        {kopecksToRubLabel(row.cashK.toString())} / {kopecksToRubLabel(row.debtK.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      Итого по партиям
                    </th>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {gramsToKgLabel(batchAgg.shippedG.toString())}
                    </td>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {gramsToKgLabel(batchAgg.soldG.toString())}
                    </td>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {gramsToKgLabel(batchAgg.shortageG.toString())}
                    </td>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {gramsToKgLabel(batchAgg.netTransitG.toString())}
                    </td>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {kopecksToRubLabel(batchAgg.revenueK.toString())} ₽
                    </td>
                    <td style={{ ...thtd, background: "#fafafa", fontWeight: 600 }}>
                      {kopecksToRubLabel(batchAgg.cashK.toString())} / {kopecksToRubLabel(batchAgg.debtK.toString())}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <details className="no-print" style={{ marginTop: "0.75rem" }}>
            <summary style={{ cursor: "pointer", color: "#3f3f46" }}>Сырой JSON отчёта</summary>
            <pre
              style={{ ...preJson, marginTop: "0.5rem", fontSize: "0.8rem" }}
              tabIndex={0}
              aria-label="Полный JSON отчёта по рейсу"
            >
              {JSON.stringify(r, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
