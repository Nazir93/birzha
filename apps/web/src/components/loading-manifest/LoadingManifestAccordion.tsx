import { compareProductGradeLineLabels } from "@birzha/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { LoadingManifestDetail, LoadingManifestSummary } from "../../api/types.js";
import {
  aggregateLoadingManifestLinesByCaliber,
  formatLoadingManifestCardHeader,
  formatManifestWarehouseNames,
  loadingManifestRoadCsvContent,
} from "../../format/loading-manifest.js";
import {
  loadingManifestTripAssignLockFromDetail,
  loadingManifestTripAssignLockMessage,
} from "../../format/loading-manifest-trip-assign-lock.js";
import { loadingManifestTripDetachLockMessage } from "../../format/loading-manifest-trip-detach-lock.js";
import { formatTripSelectLabel } from "../../format/trip-label.js";
import { LoadingBlock } from "../../ui/LoadingIndicator.js";
import { ErrorAlert } from "../../ui/ErrorAlerts.js";
import { btnClassSpaced, selectFieldStyle } from "../../ui/styles.js";
import { BirzhaSelect } from "../../ui/BirzhaSelect.js";

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
  detachTrip,
  trips,
  canAppendLoad = false,
  onAppendLoad,
  canShipTrip = true,
  variant = "full",
  appendSectionPath,
  tripSectionPath,
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
  detachTrip?: {
    mutate: (manifestId: string) => void;
    isPending: boolean;
    isError: boolean;
    error: unknown;
  };
  trips: { id: string; tripNumber: string; status: string }[];
  canAppendLoad?: boolean;
  onAppendLoad?: () => void;
  /** Привязка, смена и открепление рейса — роли ship (admin, manager, warehouse, logistics). */
  canShipTrip?: boolean;
  /** full — всё; view — просмотр ПН и ссылки; trip — только смена/привязка рейса. */
  variant?: "full" | "view" | "trip";
  appendSectionPath?: string;
  tripSectionPath?: string;
}) {
  const navigate = useNavigate();
  const caliberRows = useMemo(
    () => (detail ? aggregateLoadingManifestLinesByCaliber(detail.lines) : []),
    [detail],
  );
  const partyLinesSorted = useMemo(() => {
    if (!detail) {
      return [];
    }
    return [...detail.lines].sort((a, b) => {
      const labelA = `${a.productGroup?.trim() || "Товар"} · ${a.productGradeCode?.trim() || "—"}`;
      const labelB = `${b.productGroup?.trim() || "Товар"} · ${b.productGradeCode?.trim() || "—"}`;
      const c = compareProductGradeLineLabels(labelA, labelB);
      if (c !== 0) {
        return c;
      }
      return a.lineNo - b.lineNo;
    });
  }, [detail]);
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
  const linkedTripId = detail?.tripId?.trim() ?? "";
  const canChangeTrip =
    Boolean(linkedTripId) && detail?.tripDetachLocked === false && canShipTrip && detachTrip;
  const changeTripTargetReady =
    assignTripId.trim().length > 0 && assignTripId.trim() !== linkedTripId;
  const tripSelectOptions = useMemo(() => {
    const base = trips.map((t) => ({
      value: t.id,
      label: formatTripSelectLabel({
        id: t.id,
        tripNumber: t.tripNumber,
        status: t.status,
        vehicleLabel: null,
        driverName: null,
        departedAt: null,
        assignedSellerUserId: null,
      }),
    }));
    if (!linkedTripId) {
      return [{ value: "", label: "— выбрать рейс —" }, ...base];
    }
    return [{ value: "", label: "— выбрать другой рейс —" }, ...base.filter((o) => o.value !== linkedTripId)];
  }, [trips, linkedTripId]);
  /** Текущий рейс показываем текстом выше; в селекте — только выбор другого. */
  const tripSelectValue =
    linkedTripId && assignTripId.trim() === linkedTripId ? "" : assignTripId;
  const cardHeader = formatLoadingManifestCardHeader({
    manifestNumber: detail?.manifestNumber ?? m.manifestNumber,
    destinationName: detail?.destinationName ?? m.destinationName,
    docDate: detail?.docDate ?? m.docDate,
    tripLabel: detail?.tripId ? (tripNumberById.get(detail.tripId) ?? detail.tripId) : tripLabel !== "—" ? tripLabel : "",
    warehouseLabel,
  });

  const showManifestBody = variant === "full" || variant === "view";
  const showTripSection = variant === "full" || variant === "trip";
  const showPartyLines = variant === "full" || variant === "view";

  const tripSection = detail && showTripSection ? (
    <details className="birzha-disclosure birzha-disclosure--nested" open={variant === "trip" || !tripAssignLock.locked}>
      <summary className="birzha-disclosure__summary">
        {variant === "trip" ? "Смена рейса" : "Привязка к рейсу"}
        <span className="birzha-disclosure__hint">
          {detail.tripId ? `рейс: ${tripNumberById.get(detail.tripId) ?? "—"}` : "не назначен"}
        </span>
      </summary>
      <div className="birzha-disclosure__body">
        {canChangeTrip ? (
          <>
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
              Привязано к рейсу: <strong>{tripNumberById.get(linkedTripId) ?? linkedTripId}</strong>
            </p>
            <div className="no-print birzha-clean-ops-row-actions">
              <BirzhaSelect
                id={variant === "trip" ? "loading-trip-select" : undefined}
                value={tripSelectValue}
                onChange={setAssignTripId}
                style={{ ...selectFieldStyle, minWidth: "16rem" }}
                placeholder="— выбрать другой рейс —"
                options={tripSelectOptions}
              />
              <button
                type="button"
                className="birzha-clean-ops-row-action"
                disabled={assignTrip.isPending || !changeTripTargetReady}
                onClick={() => assignTrip.mutate()}
              >
                {assignTrip.isPending ? "Смена…" : "Сменить рейс"}
              </button>
              <button
                type="button"
                className="birzha-clean-ops-row-action"
                disabled={detachTrip!.isPending}
                onClick={() => {
                  const tripLabel = tripNumberById.get(linkedTripId) ?? "рейс";
                  if (
                    window.confirm(
                      `Отвязать накладную от ${tripLabel}? Масса вернётся на склад, если по рейсу ещё не было продаж.`,
                    )
                  ) {
                    detachTrip!.mutate(manifestId);
                  }
                }}
              >
                {detachTrip!.isPending ? "Отвязка…" : "Открепить от рейса"}
              </button>
            </div>
            {assignTrip.isError ? <ErrorAlert error={assignTrip.error} title="Смена рейса" /> : null}
            {detachTrip?.isError ? <ErrorAlert error={detachTrip.error} title="Отвязка от рейса" /> : null}
          </>
        ) : tripAssignLock.locked && detail.tripId ? (
          <>
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
              Привязано к рейсу: <strong>{tripNumberById.get(detail.tripId) ?? detail.tripId}</strong>
            </p>
            {detail.tripDetachLockedReason ? (
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
                {loadingManifestTripDetachLockMessage(detail.tripDetachLockedReason)}
              </p>
            ) : (
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
                {tripAssignLock.code
                  ? loadingManifestTripAssignLockMessage(tripAssignLock.code)
                  : loadingManifestTripAssignLockMessage("already_assigned")}
              </p>
            )}
          </>
        ) : tripAssignLock.locked ? (
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
            {tripAssignLock.code
              ? loadingManifestTripAssignLockMessage(tripAssignLock.code)
              : loadingManifestTripAssignLockMessage("already_assigned")}
          </p>
        ) : canShipTrip ? (
          <>
            <div className="no-print birzha-clean-ops-row-actions">
              <BirzhaSelect
                id={variant === "trip" ? "loading-trip-select" : undefined}
                value={tripSelectValue}
                onChange={setAssignTripId}
                style={{ ...selectFieldStyle, minWidth: "16rem" }}
                placeholder="— выбрать рейс —"
                options={tripSelectOptions}
              />
              <button
                type="button"
                className="birzha-clean-ops-row-action"
                disabled={assignTrip.isPending || !assignTripId}
                onClick={() => assignTrip.mutate()}
              >
                {assignTrip.isPending ? "Привязка…" : "Привязать к рейсу"}
              </button>
            </div>
            {assignTrip.isError ? <ErrorAlert error={assignTrip.error} title="Привязка к рейсу" /> : null}
          </>
        ) : (
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
            Привязка и смена рейса — у кладовщика или логиста. Здесь доступен только просмотр.
          </p>
        )}
      </div>
    </details>
  ) : null;

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
          <strong>{cardHeader.title}</strong>
          {!isOpen && cardHeader.meta ? <> · {cardHeader.meta}</> : null}
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
            {variant === "trip" ? (
              <p
                className="birzha-loading-manifest-card-meta birzha-text-muted"
                style={{ margin: "0 0 0.65rem", fontSize: "0.88rem", lineHeight: 1.45 }}
              >
                <strong>{cardHeader.title}</strong>
                {cardHeader.meta ? <> · {cardHeader.meta}</> : null}
                {" · "}
                {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
              </p>
            ) : null}
            {showManifestBody ? (
            <section
              className="loading-manifest-print birzha-loading-manifest"
              aria-labelledby={`road-manifest-${detail.id}`}
            >
              <h3 id={`road-manifest-${detail.id}`} style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                Погрузочная накладная
              </h3>
              <p
                className="birzha-loading-manifest-card-meta birzha-text-muted loading-manifest-print-meta"
                style={{ margin: "0 0 0.55rem", fontSize: "0.88rem", lineHeight: 1.45 }}
              >
                <strong>{cardHeader.title}</strong>
                {cardHeader.meta ? <> · {cardHeader.meta}</> : null}
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
                {variant === "full" && canAppendLoad && onAppendLoad && canShipTrip ? (
                  <button type="button" className={btnClassSpaced} onClick={onAppendLoad}>
                    Догрузить товар
                  </button>
                ) : null}
                {variant === "view" && appendSectionPath ? (
                  <Link to={appendSectionPath} className={btnClassSpaced}>
                    Догрузить товар →
                  </Link>
                ) : null}
                {variant === "view" && tripSectionPath ? (
                  <Link to={tripSectionPath} className={btnClassSpaced}>
                    Сменить рейс →
                  </Link>
                ) : null}
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
                      cardHeader.title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 72) || "pn";
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
            ) : null}

            {tripSection}

            {showPartyLines ? (
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
                      {partyLinesSorted.map((line) => (
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
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
