import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { deleteTripById } from "../api/fetch-api.js";
import type { BatchListItem } from "../api/types.js";
import { formatBatchPartyCaption } from "../format/batch-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel, formatTripStatusLabel } from "../format/trip-label.js";
import { tripBatchRowsToCsv } from "../format/csv.js";
import { gramsToKgLabel, kopecksToRubLabel } from "../format/money.js";
import {
  aggregateTripBatchRows,
  buildTripBatchRows,
  reconcileBatchTotalsWithReport,
} from "../format/trip-report-rows.js";
import { canCreateTrip, isFieldSellerOnly } from "../auth/role-panels.js";
import { useAuth } from "../auth/auth-context.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import {
  btnSecondary,
  btnStyle,
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

export type TripReportViewContext = "default" | "accounting" | "sales";

const headingByContext: Record<TripReportViewContext, string> = {
  default: "Рейсы и отчёт по фуре",
  accounting: "Отчёт по рейсу (сверка)",
  sales: "Рейс и отчёт",
};

export function TripReportPanel({ viewContext = "default" }: { viewContext?: TripReportViewContext }) {
  const { user } = useAuth();
  /** Без user (API без auth в dev) — ведём себя как при полном контуре. */
  const canTripWrite = user == null || canCreateTrip(user);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [tripId, setTripId] = useState<string | "">("");
  const initialTripFromUrl = useRef(false);

  const tripsQuery = useQuery(tripsFullListQueryOptions());

  const batchesQuery = useQuery(batchesFullListQueryOptions());

  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const sortedTrips = useMemo(
    () => sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );

  useEffect(() => {
    if (initialTripFromUrl.current) {
      return;
    }
    const p = searchParams.get("trip")?.trim() ?? "";
    if (!p || sortedTrips.length === 0) {
      return;
    }
    if (sortedTrips.some((t) => t.id === p)) {
      setTripId(p);
      initialTripFromUrl.current = true;
    }
  }, [searchParams, sortedTrips]);

  const reportQuery = useQuery({
    ...shipmentReportQueryOptions(tripId || ""),
    enabled: Boolean(tripId),
  });

  const r = reportQuery.data;

  const batchRows = useMemo(() => (r ? buildTripBatchRows(r) : []), [r]);

  const batchAgg = useMemo(() => aggregateTripBatchRows(batchRows), [batchRows]);

  const reconciliation = useMemo(
    () => (r ? reconcileBatchTotalsWithReport(r, batchAgg) : null),
    [r, batchAgg],
  );

  const canDeleteTrip = useMemo(() => {
    if (!r) {
      return false;
    }
    return (
      r.shipment.totalGrams === "0" &&
      r.sales.totalGrams === "0" &&
      r.shortage.totalGrams === "0"
    );
  }, [r]);

  const deleteTripMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteTripById(id, "Недостаточно прав (нужна роль логиста, менеджера или администратора).");
    },
    onSuccess: async () => {
      setTripId("");
      await queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      await queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    },
  });

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
    const csv = tripBatchRowsToCsv(batchRows, {
      tripNumber: r.trip.tripNumber,
      tripId: r.trip.id,
      batchCaption: (batchId) => formatBatchPartyCaption(batchById.get(batchId), batchId),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilenamePart(`birzha-${r.trip.tripNumber}`)}-partii.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [r, batchRows, batchById]);

  const printReport = useCallback(() => {
    window.print();
  }, []);

  const introByContext: Record<TripReportViewContext, string> = {
    default: "Отгрузки, продажи, недостачи и деньги по рейсу.",
    accounting: "Сверка товара и денег по рейсу.",
    sales: "Ваши рейсы, продажи и долги.",
  };

  const emptyTextByContext: Record<TripReportViewContext, string> = {
    default: "Рейсов пока нет — создайте первый рейс.",
    accounting: "Рейсов в списке нет.",
    sales: "Рейсов в списке нет.",
  };

  return (
    <div role="region" aria-labelledby="trip-report-heading">
      <h2 id="trip-report-heading" style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
        {headingByContext[viewContext]}
      </h2>
      <p className="no-print" style={muted}>
        {introByContext[viewContext]}
      </p>
      {isFieldSellerOnly(user) && viewContext === "sales" ? (
        <p className="no-print" style={{ ...muted, marginTop: "0.35rem" }}>
          Только закреплённые за вами рейсы.
        </p>
      ) : null}

      {tripsQuery.isPending && (
        <div className="no-print" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
          <LoadingBlock label="Загрузка списка рейсов…" minHeight={64} />
        </div>
      )}
      {tripsQuery.isError && (
        <p className="no-print" role="alert" style={errorText}>
          Не удалось загрузить рейсы. Проверьте связь и повторите.
        </p>
      )}

      {tripsQuery.data && sortedTrips.length === 0 && (
        <p className="no-print" style={{ ...muted, marginTop: "0.5rem" }}>
          {emptyTextByContext[viewContext]}
        </p>
      )}

      {sortedTrips.length > 0 && (
        <div className="no-print" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="trip-select" style={{ ...muted, display: "block", marginBottom: "0.35rem" }}>
            Выберите рейс
          </label>
          <select id="trip-select" value={tripId} onChange={(e) => setTripId(e.target.value)} style={fieldStyleFullWidth}>
            <option value="">—</option>
            {sortedTrips.map((t) => {
              const label = formatTripSelectLabel(t);
              return (
                <option key={t.id} value={t.id}>
                  {label.length > 120 ? `${label.slice(0, 117)}…` : label}
                </option>
              );
            })}
          </select>
          {canTripWrite && (
            <p style={{ ...muted, marginTop: "0.5rem", marginBottom: 0, fontSize: "0.82rem" }}>
              Удалить рейс можно только если по нему нет отгрузок, продаж и недостач (пустой «тестовый» рейс). Нужны
              права логиста, менеджера или администратора.
            </p>
          )}
          {tripId && r && canDeleteTrip && canTripWrite && (
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="no-print birzha-btn-danger-outline"
                style={btnStyle}
                disabled={deleteTripMutation.isPending}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm("Удалить этот рейс из системы? Операция необратима.")
                  ) {
                    return;
                  }
                  deleteTripMutation.mutate(tripId);
                }}
              >
                {deleteTripMutation.isPending ? "Удаление…" : "Удалить пустой рейс"}
              </button>
            </div>
          )}
          {deleteTripMutation.isError && (
            <p className="no-print" role="alert" style={{ ...errorText, marginTop: "0.5rem", marginBottom: 0 }}>
              {(deleteTripMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      {tripId && reportQuery.isPending && (
        <div className="no-print" style={{ marginTop: "0.75rem", marginBottom: 0 }} role="status" aria-live="polite">
          <LoadingBlock label="Загрузка отчёта по рейсу (shipment-report)…" minHeight={72} />
        </div>
      )}
      {tripId && reportQuery.isFetching && !reportQuery.isPending && (
        <p className="no-print" style={{ marginTop: "0.5rem" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Обновление отчёта…" />
        </p>
      )}
      {tripId && reportQuery.isError && (
        <p className="no-print" role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
          Отчёт недоступен: рейс не найден или сервер временно не отвечает.
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
              <strong>{r.trip.tripNumber}</strong> · статус: <code>{formatTripStatusLabel(r.trip.status)}</code>
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
            {(r.trip.vehicleLabel || r.trip.driverName || r.trip.departedAt) && (
              <span style={{ width: "100%", fontSize: "0.88rem", lineHeight: 1.45, margin: "0.25rem 0 0" }}>
                {r.trip.vehicleLabel ? `ТС: ${r.trip.vehicleLabel}` : null}
                {r.trip.vehicleLabel && (r.trip.driverName || r.trip.departedAt) ? " · " : null}
                {r.trip.driverName ? `Водитель: ${r.trip.driverName}` : null}
                {r.trip.driverName && r.trip.departedAt ? " · " : null}
                {r.trip.departedAt ? `Время: ${new Date(r.trip.departedAt).toLocaleString("ru-RU")}` : null}
              </span>
            )}
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
                <td style={thtd}>Отгрузка, ящики (по строкам отгрузки)</td>
                <td style={thtd}>{r.shipment.totalPackageCount}</td>
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
            Остаток в пути = отгружено − продано − недостача.
          </p>
          {reconciliationIssues.length > 0 && (
            <p role="status" className="birzha-callout-warning">
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
                      Партия (накладная · товар · калибр)
                    </th>
                    <th scope="col" style={thHead}>
                      Отгр., кг
                    </th>
                    <th scope="col" style={thHead}>
                      Отгр., ящ.
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
                  {batchRows.map((row) => {
                    const batchMeta = batchById.get(row.batchId);
                    const caption = formatBatchPartyCaption(batchMeta, row.batchId);
                    return (
                    <tr key={row.batchId}>
                      <td style={thtd} title={`Технический id партии: ${row.batchId}`}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.35 }}>{caption}</div>
                      </td>
                      <td style={thtd}>{gramsToKgLabel(row.shippedG.toString())}</td>
                      <td style={thtd}>{row.shippedPackages.toString()}</td>
                      <td style={thtd}>{gramsToKgLabel(row.soldG.toString())}</td>
                      <td style={thtd}>{gramsToKgLabel(row.shortageG.toString())}</td>
                      <td
                        className={row.netTransitG < 0n ? "birzha-text-danger" : undefined}
                        style={{
                          ...thtd,
                          ...(row.netTransitG < 0n ? { fontWeight: 600 } : {}),
                        }}
                      >
                        {gramsToKgLabel(row.netTransitG.toString())}
                      </td>
                      <td style={thtd}>{kopecksToRubLabel(row.revenueK.toString())} ₽</td>
                      <td style={thtd}>
                        {kopecksToRubLabel(row.cashK.toString())} / {kopecksToRubLabel(row.debtK.toString())}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="birzha-table-subtotal-row">
                    <th scope="row" style={thtd}>
                      Итого по партиям
                    </th>
                    <td style={thtd}>{gramsToKgLabel(batchAgg.shippedG.toString())}</td>
                    <td style={thtd}>{batchAgg.shippedPackages.toString()}</td>
                    <td style={thtd}>{gramsToKgLabel(batchAgg.soldG.toString())}</td>
                    <td style={thtd}>{gramsToKgLabel(batchAgg.shortageG.toString())}</td>
                    <td style={thtd}>{gramsToKgLabel(batchAgg.netTransitG.toString())}</td>
                    <td style={thtd}>{kopecksToRubLabel(batchAgg.revenueK.toString())} ₽</td>
                    <td style={thtd}>
                      {kopecksToRubLabel(batchAgg.cashK.toString())} / {kopecksToRubLabel(batchAgg.debtK.toString())}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <details className="no-print" style={{ marginTop: "0.75rem" }}>
            <summary className="birzha-text-subtle" style={{ cursor: "pointer" }}>
              Сырой JSON отчёта
            </summary>
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
