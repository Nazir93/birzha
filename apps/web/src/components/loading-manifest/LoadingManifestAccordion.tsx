import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { LoadingManifestDetail, LoadingManifestSummary } from "../../api/types.js";
import {
  aggregateLoadingManifestLinesByCaliber,
  formatLoadingManifestDisplayName,
  formatManifestWarehouseNames,
  loadingManifestRoadCsvContent,
} from "../../format/loading-manifest.js";
import {
  loadingManifestTripAssignLockFromDetail,
  loadingManifestTripAssignLockMessage,
} from "../../format/loading-manifest-trip-assign-lock.js";
import { LoadingBlock } from "../../ui/LoadingIndicator.js";
import { ErrorAlert } from "../../ui/ErrorAlerts.js";
import { fieldStyle } from "../../ui/styles.js";

function formatPkg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) {
    return "—";
  }
  if (n <= 0) {
    return "—";
  }
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function LoadingManifestAccordion({
  m,
  manifestId,
  manifestBasePath,
  tripNumberById,
  detail,
  detailLoading,
  detailError,
  assignTripId,
  setAssignTripId,
  assignTrip,
  trips,
}: {
  m: LoadingManifestSummary;
  manifestId: string;
  manifestBasePath: string;
  tripNumberById: Map<string, string>;
  detail: LoadingManifestDetail | null;
  detailLoading: boolean;
  detailError: boolean;
  assignTripId: string;
  setAssignTripId: (v: string) => void;
  assignTrip: {
    mutate: () => void;
    isPending: boolean;
    isError: boolean;
    error: unknown;
  };
  trips: { id: string; tripNumber: string; status: string }[];
}) {
  const navigate = useNavigate();
  const caliberRows = useMemo(
    () => (detail ? aggregateLoadingManifestLinesByCaliber(detail.lines) : []),
    [detail],
  );
  const warehouseLabel = formatManifestWarehouseNames(
    detail?.lineWarehouseNames ??
      m.lineWarehouseNames ??
      detail?.lines.map((ln) => ln.warehouseName ?? "").filter(Boolean),
    detail?.warehouseName ?? m.warehouseName,
  );
  const showLineWarehouseColumn = useMemo(() => {
    if (!detail) {
      return false;
    }
    const names = new Set(
      detail.lines.map((ln) => ln.warehouseName?.trim() ?? "").filter(Boolean),
    );
    return names.size > 1;
  }, [detail]);
  const roadTripLabel = detail?.tripId ? (tripNumberById.get(detail.tripId) ?? detail.tripId) : "";
  const tripAssignLock = detail ? loadingManifestTripAssignLockFromDetail(detail) : { locked: false as const };
  const [partyLinesOpen, setPartyLinesOpen] = useState(false);
  useEffect(() => {
    if (detail) {
      setPartyLinesOpen(false);
    }
  }, [detail?.tripId, detail?.id]);
  const tripLabel = m.tripId ? (tripNumberById.get(m.tripId) ?? m.tripId) : "—";
  const isOpen = manifestId === m.id;
  const detailPath = `${manifestBasePath}/${encodeURIComponent(m.id)}`;

  return (
    <details className="birzha-disclosure birzha-disclosure--nested" open={isOpen}>
      <summary
        className="birzha-disclosure__summary"
        onClick={(e) => {
          e.preventDefault();
          if (manifestId === m.id) {
            navigate(manifestBasePath);
          } else {
            navigate(detailPath);
          }
        }}
      >
        <span>
          <strong>
            {formatLoadingManifestDisplayName({
              manifestNumber: m.manifestNumber,
              destinationName: m.destinationName,
            })}
          </strong>{" "}
          · {m.docDate} · {warehouseLabel} · рейс: {tripLabel}
        </span>
        <span className="birzha-disclosure__hint">
          {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг · {m.lineCount} парт. · ящ. ≈{" "}
          {formatPkg(m.packagesApprox)}
        </span>
      </summary>
      <div className="birzha-disclosure__body">
        {detailLoading ? (
          <LoadingBlock label="Загрузка карточки…" minHeight={56} skeleton skeletonRows={4} />
        ) : null}
        {detailError ? (
          <ErrorAlert message="Не удалось загрузить карточку накладной." title="Карточка ПН" />
        ) : null}

        {detail ? (
          <>
            <section
              className="loading-manifest-print birzha-loading-manifest"
              aria-labelledby={`road-manifest-${detail.id}`}
            >
              <h3 id={`road-manifest-${detail.id}`} style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                Погрузочная накладная
              </h3>
              <p style={{ margin: "0 0 0.55rem", fontSize: "0.88rem", lineHeight: 1.45 }} className="birzha-text-muted">
                <strong>
                  {formatLoadingManifestDisplayName({
                    manifestNumber: detail.manifestNumber,
                    destinationName: detail.destinationName,
                  })}
                </strong>{" "}
                · {detail.docDate} · {warehouseLabel}
                {detail.tripId ? (
                  <>
                    {" "}
                    · рейс: <strong>{roadTripLabel}</strong>
                  </>
                ) : null}
              </p>
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
                <table className="birzha-data-table birzha-data-table--compact" style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th>Калибр</th>
                      <th className="birzha-data-table__num">Кг</th>
                      <th className="birzha-data-table__num">Ящ.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caliberRows.map((r) => (
                      <tr key={r.caliberLabel}>
                        <td>{r.caliberLabel}</td>
                        <td className="birzha-data-table__num">
                          {r.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="birzha-data-table__num">
                          {r.totalPackages != null ? r.totalPackages.toLocaleString("ru-RU") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" style={{ fontWeight: 700 }}>
                        Итого
                      </th>
                      <td className="birzha-data-table__num">
                        {caliberRows
                          .reduce((a, r) => a + r.totalKg, 0)
                          .toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="birzha-data-table__num">
                        {caliberRows.some((r) => r.totalPackages != null)
                          ? caliberRows
                              .reduce((a, r) => a + (r.totalPackages ?? 0), 0)
                              .toLocaleString("ru-RU", { maximumFractionDigits: 0 })
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="no-print birzha-clean-ops-row-actions" style={{ marginTop: "0.65rem" }}>
                <button type="button" className="birzha-clean-ops-row-action" onClick={() => window.print()}>
                  Печать накладной
                </button>
                <button
                  type="button"
                  className="birzha-clean-ops-row-action"
                  onClick={() => {
                    const csv = loadingManifestRoadCsvContent({
                      manifestNumber: detail.manifestNumber,
                      docDate: detail.docDate,
                      warehouseLabel: warehouseLabel,
                      destinationName: detail.destinationName,
                      tripLabel: roadTripLabel || "—",
                      rows: caliberRows,
                    });
                    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const slug =
                      formatLoadingManifestDisplayName({
                        manifestNumber: detail.manifestNumber,
                        destinationName: detail.destinationName,
                      })
                        .replace(/[/\\?%*:|"<>]/g, "-")
                        .slice(0, 72) || "pn";
                    a.download = `nakladnaya-na-mashinu-${slug}-${detail.docDate}.csv`;
                    a.rel = "noopener";
                    document.body.append(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Сохранить CSV
                </button>
              </div>
            </section>

            <details className="birzha-disclosure birzha-disclosure--nested" open={!tripAssignLock.locked}>
              <summary className="birzha-disclosure__summary">
                Привязка к рейсу
                <span className="birzha-disclosure__hint">
                  {detail.tripId ? `рейс: ${tripNumberById.get(detail.tripId) ?? "—"}` : "не назначен"}
                </span>
              </summary>
              <div className="birzha-disclosure__body">
                {tripAssignLock.locked ? (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
                    {tripAssignLock.code
                      ? loadingManifestTripAssignLockMessage(tripAssignLock.code)
                      : loadingManifestTripAssignLockMessage("already_assigned")}
                  </p>
                ) : (
                  <>
                    <div className="no-print birzha-clean-ops-row-actions">
                      <select
                        value={assignTripId}
                        onChange={(e) => setAssignTripId(e.target.value)}
                        style={{ ...fieldStyle, minWidth: "16rem" }}
                      >
                        <option value="">— выбрать рейс —</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.tripNumber} · {t.status}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="birzha-clean-ops-row-action"
                        disabled={assignTrip.isPending || !assignTripId}
                        onClick={() => assignTrip.mutate()}
                      >
                        {assignTrip.isPending ? "Привязка…" : "Привязать к рейсу"}
                      </button>
                    </div>
                    {assignTrip.isError ? (
                      <ErrorAlert error={assignTrip.error} title="Привязка к рейсу" />
                    ) : null}
                  </>
                )}
              </div>
            </details>

            <details
              className="birzha-disclosure birzha-disclosure--nested"
              open={partyLinesOpen}
              onToggle={(e) => {
                setPartyLinesOpen(e.currentTarget.open);
              }}
            >
              <summary className="birzha-disclosure__summary">
                Все строки (партии)
                <span className="birzha-disclosure__hint">{detail.lines.length} строк</span>
              </summary>
              <div className="birzha-disclosure__body">
                <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
                  <table className="birzha-data-table birzha-data-table--compact" style={{ minWidth: 740 }}>
                    <thead>
                      <tr>
                        <th>№</th>
                        {showLineWarehouseColumn ? <th>Склад</th> : null}
                        <th>Накладная закупки</th>
                        <th>Калибр</th>
                        <th className="birzha-data-table__num">Кг</th>
                        <th className="birzha-data-table__num">Ящ.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.batchId}>
                          <td>{line.lineNo}</td>
                          {showLineWarehouseColumn ? (
                            <td>{line.warehouseName?.trim() || "—"}</td>
                          ) : null}
                          <td>{line.purchaseDocumentNumber ?? "—"}</td>
                          <td>{`${line.productGroup?.trim() || "Товар"} · ${line.productGradeCode?.trim() || "—"}`}</td>
                          <td className="birzha-data-table__num">
                            {line.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="birzha-data-table__num">{line.packageCount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </details>
  );
}
