import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { BatchListItem, TripSaleLineJson } from "../api/types.js";
import { kopecksToRubLabel } from "../format/money.js";
import { groupTripSaleLinesByCaliberForDisplay } from "../format/trip-sale-line-groups.js";
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

function TripSalesByCaliberTable({
  lines,
  batchById,
}: {
  lines: readonly TripSaleLineJson[];
  batchById: Map<string, BatchListItem>;
}) {
  const rows = useMemo(
    () => groupTripSaleLinesByCaliberForDisplay(lines, batchById),
    [lines, batchById],
  );

  if (rows.length === 0) {
    return <BirzhaEmptyState compact title="По этому рейсу нет зафиксированных продаж" />;
  }

  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
      <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Продажи по калибру">
        <thead>
          <tr>
            <th scope="col" style={thHead}>
              Калибр
            </th>
            <th scope="col" style={thHead}>
              Сделок
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
              Нал / карта / долг
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={thtd}>{row.lineLabel}</td>
              <td style={thtd}>{row.dealCount}</td>
              <td style={thtd}>{row.totalKg}</td>
              <td style={thtd}>{row.totalPackages ?? "—"}</td>
              <td style={thtd}>{kopecksToRubLabel(row.totalRevenueKopecks.toString())} ₽</td>
              <td style={thtd}>
                {kopecksToRubLabel(row.totalCashKopecks.toString())} /{" "}
                {kopecksToRubLabel(row.totalCardTransferKopecks.toString())} /{" "}
                {kopecksToRubLabel(row.totalDebtKopecks.toString())}
              </td>
            </tr>
          ))}
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

      {linesQ.isSuccess && (linesQ.data?.lines.length ?? 0) > 0 ? (
        <>
          <h4 className="birzha-form-label" style={{ margin: "1.25rem 0 0.5rem", fontSize: "0.95rem" }}>
            Журнал сделок
          </h4>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 640 }} aria-label="Журнал сделок по рейсу">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    №
                  </th>
                  <th scope="col" style={thHead}>
                    Кому
                  </th>
                  <th scope="col" style={thHead}>
                    кг
                  </th>
                  <th scope="col" style={thHead}>
                    Сумма
                  </th>
                  <th scope="col" style={thHead}>
                    Нал / карта / долг
                  </th>
                </tr>
              </thead>
              <tbody>
                {(linesQ.data?.lines ?? []).map((line, idx) => (
                  <tr key={line.id}>
                    <td style={thtd}>{idx + 1}</td>
                    <td style={thtd}>
                      {line.clientLabel?.trim()
                        ? line.clientLabel.trim()
                        : line.saleChannel === "wholesale"
                          ? "Опт"
                          : "Розница"}
                    </td>
                    <td style={thtd}>{line.kg}</td>
                    <td style={thtd}>{kopecksToRubLabel(line.revenueKopecks)} ₽</td>
                    <td style={thtd}>
                      {kopecksToRubLabel(line.cashKopecks)} / {kopecksToRubLabel(line.cardTransferKopecks || "0")} /{" "}
                      {kopecksToRubLabel(line.debtKopecks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h4 className="birzha-form-label" style={{ margin: "1.25rem 0 0.5rem", fontSize: "0.95rem" }}>
        Продажи по калибру (сумма по рейсу)
      </h4>
      {linesQ.isError ? (
        <ErrorAlert
          title="Продажи по калибру"
          message="Не удалось загрузить список сделок. Сводка выше может быть неполной."
        />
      ) : (
        <TripSalesByCaliberTable lines={linesQ.data?.lines ?? []} batchById={batchById} />
      )}
    </div>
  );
}
