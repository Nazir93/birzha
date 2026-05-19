import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LoadingManifestDetail, LoadingManifestSummary } from "../api/types.js";
import { apiPostJson } from "../api/fetch-api.js";
import {
  aggregateLoadingManifestLinesByCaliber,
  formatLoadingManifestDisplayName,
  loadingManifestRoadCsvContent,
} from "../format/loading-manifest.js";
import { closedTripIdSet, filterTripsInWork, splitLoadingManifestsByArchive } from "../format/archive.js";
import {
  loadingManifestTripAssignLockFromDetail,
  loadingManifestTripAssignLockMessage,
} from "../format/loading-manifest-trip-assign-lock.js";
import {
  loadingManifestDetailQueryOptions,
  loadingManifestsListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function formatPkg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) {
    return "—";
  }
  if (n <= 0) {
    return "—";
  }
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

/** Карточка GET /loading-manifests/:id для списка, пока общий GET /list ещё без этой строки. */
function loadingSummaryFromDetail(d: LoadingManifestDetail): LoadingManifestSummary {
  let totalKg = 0;
  let packagesSum = 0;
  let linesWithPkg = 0;
  for (const ln of d.lines) {
    totalKg += ln.kg;
    const raw = ln.packageCount?.trim();
    if (raw != null && raw !== "") {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n) && n > 0) {
        packagesSum += n;
        linesWithPkg += 1;
      }
    }
  }
  return {
    id: d.id,
    manifestNumber: d.manifestNumber,
    docDate: d.docDate,
    warehouseId: d.warehouseId,
    warehouseName: d.warehouseName,
    warehouseCode: d.warehouseCode,
    destinationCode: d.destinationCode,
    destinationName: d.destinationName,
    tripId: d.tripId,
    createdAt: d.createdAt,
    lineCount: d.lines.length,
    totalKg,
    packagesApprox: linesWithPkg > 0 ? packagesSum : null,
    calibers: [],
  };
}

export function AdminLoadingManifestsPanel() {
  const { manifestId = "" } = useParams();
  const { pathname } = useLocation();
  const manifestBasePath = adminAwarePathForPath(pathname, adminRoutes.loadingManifests, ops.loadingManifests);
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(() => readPreferredWarehouseId() ?? "");
  const listQuery = useQuery(loadingManifestsListQueryOptions());
  const warehousesQuery = useQuery(warehousesFullListQueryOptions());
  const detailQuery = useQuery(loadingManifestDetailQueryOptions(manifestId));
  const tripsQuery = useQuery(tripsFullListQueryOptions());

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQuery.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQuery.data?.trips]);

  const allManifests = listQuery.data?.loadingManifests ?? [];
  const closedIds = useMemo(() => closedTripIdSet(tripsQuery.data?.trips ?? []), [tripsQuery.data?.trips]);
  const manifests = useMemo(
    () => splitLoadingManifestsByArchive(allManifests, closedIds).active,
    [allManifests, closedIds],
  );
  const archivePath = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);
  const openTripsForAssign = useMemo(
    () => filterTripsInWork(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );
  const detail = detailQuery.data?.manifest;

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehousesQuery.data?.warehouses ?? []) {
      map.set(w.id, `${w.name} (${w.code})`);
    }
    for (const m of manifests) {
      if (!map.has(m.warehouseId)) {
        map.set(m.warehouseId, `${m.warehouseName} (${m.warehouseCode})`);
      }
    }
    if (detail && !map.has(detail.warehouseId)) {
      map.set(detail.warehouseId, `${detail.warehouseName} (${detail.warehouseCode})`);
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [warehousesQuery.data?.warehouses, manifests, detail]);

  useEffect(() => {
    if (!selectedWarehouse) {
      return;
    }
    if (!warehouseOptions.some((w) => w.id === selectedWarehouse)) {
      if (manifestId.trim() && detailQuery.isPending) {
        return;
      }
      setSelectedWarehouse("");
    }
  }, [selectedWarehouse, warehouseOptions, manifestId, detailQuery.isPending]);

  useEffect(() => {
    if (!manifestId.trim()) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "list"] });
  }, [manifestId, queryClient]);

  useEffect(() => {
    const id = manifestId.trim();
    if (!id) {
      return;
    }
    const fromList = manifests.find((x) => x.id === id);
    if (fromList) {
      setSelectedWarehouse(fromList.warehouseId);
      writePreferredWarehouseId(fromList.warehouseId);
      return;
    }
    if (detail && detail.id === id) {
      setSelectedWarehouse(detail.warehouseId);
      writePreferredWarehouseId(detail.warehouseId);
    }
  }, [manifestId, manifests, detail]);

  const syntheticSummary = useMemo((): LoadingManifestSummary | null => {
    const id = manifestId.trim();
    if (!id || !detail || detail.id !== id) {
      return null;
    }
    if (manifests.some((x) => x.id === id)) {
      return null;
    }
    return loadingSummaryFromDetail(detail);
  }, [manifestId, detail, manifests]);

  const displayManifests = useMemo(() => {
    if (!selectedWarehouse) {
      return [];
    }
    const filtered = manifests.filter((m) => m.warehouseId === selectedWarehouse);
    const syn = syntheticSummary;
    if (syn && syn.warehouseId === selectedWarehouse && !filtered.some((m) => m.id === syn.id)) {
      return [syn, ...filtered];
    }
    return filtered;
  }, [manifests, selectedWarehouse, syntheticSummary]);

  const grandSummary = useMemo(() => {
    let totalKg = 0;
    let packagesSum = 0;
    let packagesKnown = 0;
    const byWarehouse = new Map<string, { kg: number; manifests: number }>();
    const byDestination = new Map<string, { kg: number; manifests: number }>();

    for (const m of displayManifests) {
      totalKg += m.totalKg ?? 0;
      const pkg = m.packagesApprox;
      if (pkg != null && pkg > 0) {
        packagesSum += pkg;
        packagesKnown += 1;
      }
      const whKey = `${m.warehouseName} (${m.warehouseCode})`;
      const wh = byWarehouse.get(whKey) ?? { kg: 0, manifests: 0 };
      wh.kg += m.totalKg ?? 0;
      wh.manifests += 1;
      byWarehouse.set(whKey, wh);

      const dest = byDestination.get(m.destinationName) ?? { kg: 0, manifests: 0 };
      dest.kg += m.totalKg ?? 0;
      dest.manifests += 1;
      byDestination.set(m.destinationName, dest);
    }

    return {
      count: displayManifests.length,
      totalKg,
      packagesSum: packagesKnown > 0 ? packagesSum : null,
      byWarehouse: [...byWarehouse.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")),
      byDestination: [...byDestination.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")),
    };
  }, [displayManifests]);

  const hasMainExplorer = manifests.length > 0 || manifestId.trim().length > 0;

  const assignTrip = useMutation({
    mutationFn: async () => {
      if (!manifestId.trim() || !assignTripId.trim()) {
        throw new Error("Выберите рейс для привязки.");
      }
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(manifestId)}/assign-trip`, { tripId: assignTripId.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "list"] });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, manifestId.trim()] });
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    },
  });

  return (
    <section className="birzha-card" aria-labelledby="admin-loading-manifests-h">
      <h2 id="admin-loading-manifests-h" style={{ margin: "0 0 0.65rem", fontSize: "1.08rem" }}>
        Погрузка
      </h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
        Только погрузочные в работе. По закрытым рейсам — в разделе{" "}
        <Link to={archivePath}>«Архив»</Link>.
      </p>

      {listQuery.isPending ? (
        <LoadingBlock label="Загрузка списка накладных…" minHeight={80} skeleton skeletonRows={5} />
      ) : null}
      {listQuery.isError ? (
        <p style={errorText} role="alert">
          Не удалось загрузить список погрузочных накладных.
        </p>
      ) : null}

      {(listQuery.data != null || manifestId.trim().length > 0) && (
        <>
          {!hasMainExplorer ? (
            <BirzhaEmptyState compact title="Нет сохранённых накладных" />
          ) : (
            <>
              {manifestId.trim() && detailQuery.isPending && !manifests.some((x) => x.id === manifestId.trim()) ? (
                <p className="birzha-text-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }} role="status">
                  Загрузка накладной по ссылке…
                </p>
              ) : null}
              <div style={{ marginBottom: "1rem", width: "100%", maxWidth: "100%" }}>
                <label
                  htmlFor="load-manifest-warehouse"
                  className="birzha-form-label birzha-form-label--block birzha-form-label--mb-sm"
                >
                  Склад
                </label>
                <select
                  id="load-manifest-warehouse"
                  value={selectedWarehouse}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedWarehouse(v);
                    writePreferredWarehouseId(v === "" ? null : v);
                  }}
                  style={{ ...fieldStyle, maxWidth: "100%" }}
                  disabled={warehousesQuery.isPending}
                  aria-busy={warehousesQuery.isPending ? true : undefined}
                >
                  <option value="">— выберите склад —</option>
                  {warehouseOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                {warehousesQuery.isError ? (
                  <p className="birzha-text-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.82rem" }} role="status">
                    Справочник складов не загрузился — в списке только склады из накладных.{" "}
                    {(warehousesQuery.error as Error)?.message ?? String(warehousesQuery.error ?? "")}
                  </p>
                ) : null}
              </div>

              {!selectedWarehouse ? (
                <BirzhaEmptyState compact title="Выберите склад" />
              ) : (
                <>
                  <BirzhaDisclosure
                    defaultOpen
                    title="Погрузочные накладные"
                    bodyClassName="birzha-disclosure__body birzha-disclosure__body--stack"
                  >
                    {displayManifests.length === 0 ? (
                      <BirzhaEmptyState compact title="На этом складе нет сохранённых накладных" />
                    ) : (
                      displayManifests.map((m) => (
                        <ManifestAccordionBlock
                          key={m.id}
                          m={m}
                          manifestId={manifestId}
                          manifestBasePath={manifestBasePath}
                          tripNumberById={tripNumberById}
                          detail={detail && detail.id === m.id ? detail : null}
                          detailLoading={Boolean(manifestId && manifestId === m.id && detailQuery.isPending)}
                          detailError={Boolean(manifestId && manifestId === m.id && detailQuery.isError)}
                          assignTripId={assignTripId}
                          setAssignTripId={setAssignTripId}
                          assignTrip={assignTrip}
                          trips={openTripsForAssign}
                        />
                      ))
                    )}
                  </BirzhaDisclosure>

                  <BirzhaDisclosure defaultOpen title="Общая сводка по погрузочным накладным на складе">
                    {grandSummary.count === 0 ? (
                      <BirzhaEmptyState compact title="Нет данных для сводки" />
                    ) : (
                      <>
                        <p style={{ margin: "0 0 0.55rem", fontSize: "0.9rem" }}>
                          <strong>Всего:</strong> {grandSummary.count} накладных ·{" "}
                          <strong>{grandSummary.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг</strong>
                          {grandSummary.packagesSum != null ? (
                            <>
                              {" "}
                              · ящ. ≈ <strong>{grandSummary.packagesSum.toLocaleString("ru-RU")}</strong> (по строкам с оценкой)
                            </>
                          ) : null}
                        </p>
                        <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.65rem" }}>
                          <table style={{ ...tableStyle, minWidth: 360 }}>
                            <caption style={{ captionSide: "top", textAlign: "left", fontWeight: 600, paddingBottom: 6 }}>
                              По складам
                            </caption>
                            <thead>
                              <tr>
                                <th style={thHead}>Склад</th>
                                <th style={thHead}>Накладных</th>
                                <th style={thHead}>Кг</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grandSummary.byWarehouse.map(([name, v]) => (
                                <tr key={name}>
                                  <td style={thtd}>{name}</td>
                                  <td style={thtd}>{v.manifests}</td>
                                  <td style={thtd}>{v.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                          <table style={{ ...tableStyle, minWidth: 360 }}>
                            <caption style={{ captionSide: "top", textAlign: "left", fontWeight: 600, paddingBottom: 6 }}>
                              По направлениям (город / канал)
                            </caption>
                            <thead>
                              <tr>
                                <th style={thHead}>Направление</th>
                                <th style={thHead}>Накладных</th>
                                <th style={thHead}>Кг</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grandSummary.byDestination.map(([name, v]) => (
                                <tr key={name}>
                                  <td style={thtd}>{name}</td>
                                  <td style={thtd}>{v.manifests}</td>
                                  <td style={thtd}>{v.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </BirzhaDisclosure>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function ManifestAccordionBlock({
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
  const roadTripLabel = detail?.tripId ? (tripNumberById.get(detail.tripId) ?? detail.tripId) : "";
  const tripAssignLock = detail ? loadingManifestTripAssignLockFromDetail(detail) : { locked: false as const };
  const [partyLinesOpen, setPartyLinesOpen] = useState(true);
  useEffect(() => {
    if (detail) {
      setPartyLinesOpen(!detail.tripId);
    }
  }, [detail?.tripId, detail?.id]);
  const tripLabel = m.tripId ? tripNumberById.get(m.tripId) ?? m.tripId : "—";
  const isOpen = manifestId === m.id;
  const detailPath = `${manifestBasePath}/${encodeURIComponent(m.id)}`;

  return (
    <details className="birzha-disclosure birzha-disclosure--nested" open={isOpen}>
      <summary
        className="birzha-disclosure__summary"
        style={{ cursor: "pointer" }}
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
          · {m.docDate} · {m.warehouseName} ({m.warehouseCode}) · рейс: {tripLabel}
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
          <p style={errorText} role="alert">
            Не удалось загрузить карточку накладной.
          </p>
        ) : null}

        {detail ? (
          <>
            <details className="birzha-disclosure birzha-disclosure--nested" open={!tripAssignLock.locked}>
              <summary className="birzha-disclosure__summary">
                Привязка к рейсу
                <span className="birzha-disclosure__hint">
                  {detail.tripId
                    ? `рейс: ${tripNumberById.get(detail.tripId) ?? "—"}`
                    : "не назначен"}
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
                    <div
                      className="no-print"
                      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
                    >
                      <select
                        value={assignTripId}
                        onChange={(e) => setAssignTripId(e.target.value)}
                        style={{ minWidth: "16rem" }}
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
                        style={btnStyle}
                        disabled={assignTrip.isPending || !assignTripId}
                        onClick={() => assignTrip.mutate()}
                      >
                        {assignTrip.isPending ? "Привязка…" : "Привязать к рейсу"}
                      </button>
                    </div>
                    {assignTrip.isError ? (
                      <p style={errorText} role="alert">
                        {assignTrip.error instanceof Error ? assignTrip.error.message : String(assignTrip.error ?? "")}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </details>

            {detail.tripId ? (
              <section
                className="loading-manifest-print birzha-loading-manifest"
                aria-labelledby={`road-manifest-${detail.id}`}
              >
                <h3 id={`road-manifest-${detail.id}`} style={{ margin: "0 0 0.5rem", fontSize: "0.98rem" }}>
                  Накладная на машину (свод по калибрам)
                </h3>
                <p style={{ margin: "0 0 0.55rem", fontSize: "0.88rem", lineHeight: 1.45 }} className="birzha-text-muted">
                  <strong>
                    {formatLoadingManifestDisplayName({
                      manifestNumber: detail.manifestNumber,
                      destinationName: detail.destinationName,
                    })}
                  </strong>{" "}
                  · {detail.docDate} · {detail.warehouseName} ({detail.warehouseCode}) · рейс:{" "}
                  <strong>{roadTripLabel}</strong>
                </p>
                <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                  <table style={{ ...tableStyle, minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th style={thHead}>Калибр</th>
                        <th style={thHead}>Кг</th>
                        <th style={thHead}>Ящ.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caliberRows.map((r) => (
                        <tr key={r.caliberLabel}>
                          <td style={thtd}>{r.caliberLabel}</td>
                          <td style={thtd}>{r.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                          <td style={thtd}>
                            {r.totalPackages != null ? r.totalPackages.toLocaleString("ru-RU") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" style={{ ...thtd, fontWeight: 700 }}>
                          Итого
                        </th>
                        <td style={thtd}>
                          {caliberRows
                            .reduce((a, r) => a + r.totalKg, 0)
                            .toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td style={thtd}>
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
                <div className="no-print" style={{ marginTop: "0.65rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <button type="button" style={btnStyle} onClick={() => window.print()}>
                    Печать накладной
                  </button>
                  <button
                    type="button"
                    style={btnStyle}
                    onClick={() => {
                      const csv = loadingManifestRoadCsvContent({
                        manifestNumber: detail.manifestNumber,
                        docDate: detail.docDate,
                        warehouseLabel: `${detail.warehouseName} (${detail.warehouseCode})`,
                        destinationName: detail.destinationName,
                        tripLabel: roadTripLabel,
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
            ) : null}

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
                <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                  <table style={{ ...tableStyle, minWidth: 740 }}>
                    <thead>
                      <tr>
                        <th style={thHead}>№</th>
                        <th style={thHead}>Накладная закупки</th>
                        <th style={thHead}>Калибр</th>
                        <th style={thHead}>Кг</th>
                        <th style={thHead}>Ящ.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.batchId}>
                          <td style={thtd}>{line.lineNo}</td>
                          <td style={thtd}>{line.purchaseDocumentNumber ?? "—"}</td>
                          <td style={thtd}>{`${line.productGroup?.trim() || "Товар"} · ${line.productGradeCode?.trim() || "—"}`}</td>
                          <td style={thtd}>{line.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                          <td style={thtd}>{line.packageCount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ marginTop: "0.65rem" }} className="no-print">
                  <button type="button" style={btnStyle} onClick={() => window.print()}>
                    Печать
                  </button>
                </p>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </details>
  );
}
