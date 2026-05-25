import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { BatchListItem, TripSaleLineJson } from "../api/types.js";
import { formatNakladLineLabel } from "../format/batch-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { sortTripSaleLinesNewestFirst } from "../format/trip-sale-line-order.js";
import {
  formatSellerCorrectionSaleMeta,
  formatTripSaleLinePaymentLabel,
} from "../format/trip-sale-line-display.js";
import { formatTripSaleClientDisplayLabel } from "../format/trip-sales-channel.js";
import {
  batchesByIdsQueryOptions,
  batchesFullListQueryOptions,
  shipmentReportQueryOptions,
  tripSaleLinesQueryOptions,
} from "../query/core-list-queries.js";
import { FieldSellerTripReport } from "./FieldSellerTripReport.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

function formatSaleRecordedAtRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TripSaleLinesReadOnlyTable({
  lines,
  batchById,
}: {
  lines: readonly TripSaleLineJson[];
  batchById: Map<string, BatchListItem>;
}) {
  const sorted = useMemo(() => sortTripSaleLinesNewestFirst([...lines]), [lines]);

  if (sorted.length === 0) {
    return <BirzhaEmptyState compact title="По этому рейсу нет зафиксированных продаж" />;
  }

  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
      <table style={{ ...tableStyle, minWidth: 640 }} aria-label="Журнал продаж по рейсу">
        <thead>
          <tr>
            <th scope="col" style={thHead}>
              Когда
            </th>
            <th scope="col" style={thHead}>
              Калибр
            </th>
            <th scope="col" style={thHead}>
              кг
            </th>
            <th scope="col" style={thHead}>
              Ящ.
            </th>
            <th scope="col" style={thHead}>
              Сумма
            </th>
            <th scope="col" style={thHead}>
              Оплата
            </th>
            <th scope="col" style={thHead}>
              Канал / клиент
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((line) => {
            const b = batchById.get(line.batchId);
            const headline = b ? formatNakladLineLabel(b) : "—";
            const client =
              line.saleChannel === "wholesale"
                ? formatTripSaleClientDisplayLabel(line.clientLabel, "wholesale")
                : "Розница";
            return (
              <tr key={line.id}>
                <td style={thtd}>{formatSaleRecordedAtRu(line.recordedAt)}</td>
                <td style={thtd}>
                  <span title={formatSellerCorrectionSaleMeta(line)}>{headline}</span>
                </td>
                <td style={thtd}>{line.kg}</td>
                <td style={thtd}>{line.packageCount ?? "—"}</td>
                <td style={thtd}>{kopecksToRubLabel(line.revenueKopecks)} ₽</td>
                <td style={thtd}>{formatTripSaleLinePaymentLabel(line)}</td>
                <td style={thtd}>{client}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Подробный отчёт по продажам закрытого рейса (архив): сводка + журнал сделок.
 */
export function ArchivedTripSalesReport({
  tripId,
  tripNumber,
  fullReportPath,
}: {
  tripId: string;
  tripNumber: string;
  /** Полный отчёт со сверкой партий (для /o, /a). */
  fullReportPath?: string;
}) {
  const reportQ = useQuery({
    ...shipmentReportQueryOptions(tripId),
    enabled: tripId.length > 0,
  });

  const linesQ = useQuery({
    ...tripSaleLinesQueryOptions(tripId),
    enabled: tripId.length > 0,
  });

  const batchIdsFromLines = useMemo(
    () => [...new Set((linesQ.data?.lines ?? []).map((l) => l.batchId))],
    [linesQ.data?.lines],
  );

  const batchesByIdsQ = useQuery({
    ...batchesByIdsQueryOptions(batchIdsFromLines),
    enabled: batchIdsFromLines.length > 0,
  });

  const batchesFullQ = useQuery(batchesFullListQueryOptions());

  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesFullQ.data?.batches ?? []) {
      m.set(b.id, b);
    }
    for (const b of batchesByIdsQ.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesFullQ.data?.batches, batchesByIdsQ.data?.batches]);

  const loading = reportQ.isPending || linesQ.isPending;

  if (loading) {
    return <LoadingBlock label="Загрузка отчёта по продажам…" minHeight={120} skeleton skeletonRows={6} />;
  }

  if (reportQ.isError) {
    return (
      <ErrorAlert
        title="Отчёт недоступен"
        message="Не удалось загрузить сводку по рейсу. Проверьте связь или права доступа."
      />
    );
  }

  const report = reportQ.data;
  if (!report) {
    return null;
  }

  return (
    <div id="archive-trip-sales-report" className="birzha-panel" style={{ marginTop: "1rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
          Продажи по рейсу <strong>{tripNumber}</strong>
        </h3>
        {fullReportPath ? (
          <Link to={fullReportPath} className="birzha-ui-sm">
            Полный отчёт (партии, отгрузка, недостача)
          </Link>
        ) : null}
      </div>

      <FieldSellerTripReport report={report} batchById={batchById} />

      <h4 className="birzha-form-label" style={{ margin: "1.25rem 0 0.5rem", fontSize: "0.95rem" }}>
        Журнал продаж (каждая сделка)
      </h4>
      {linesQ.isError ? (
        <ErrorAlert
          title="Журнал продаж"
          message="Не удалось загрузить список сделок. Сводка выше может быть неполной."
        />
      ) : (
        <TripSaleLinesReadOnlyTable lines={linesQ.data?.lines ?? []} batchById={batchById} />
      )}
    </div>
  );
}
