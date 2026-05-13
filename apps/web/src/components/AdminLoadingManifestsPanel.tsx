import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LoadingManifestDetail, LoadingManifestSummary } from "../api/types.js";
import { apiPostJson } from "../api/fetch-api.js";
import { loadingManifestDetailQueryOptions, loadingManifestsListQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
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

export function AdminLoadingManifestsPanel() {
  const { manifestId = "" } = useParams();
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(() => readPreferredWarehouseId() ?? "");
  const listQuery = useQuery(loadingManifestsListQueryOptions());
  const detailQuery = useQuery(loadingManifestDetailQueryOptions(manifestId));
  const tripsQuery = useQuery(tripsFullListQueryOptions());

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQuery.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQuery.data?.trips]);

  const manifests = listQuery.data?.loadingManifests ?? [];

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of manifests) {
      if (!map.has(m.warehouseId)) {
        map.set(m.warehouseId, `${m.warehouseName} (${m.warehouseCode})`);
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [manifests]);

  useEffect(() => {
    if (!selectedWarehouse) {
      return;
    }
    if (!warehouseOptions.some((w) => w.id === selectedWarehouse)) {
      setSelectedWarehouse("");
    }
  }, [selectedWarehouse, warehouseOptions]);

  const filteredManifests = useMemo(
    () => (selectedWarehouse ? manifests.filter((m) => m.warehouseId === selectedWarehouse) : []),
    [manifests, selectedWarehouse],
  );

  useEffect(() => {
    if (!manifestId.trim()) {
      return;
    }
    const m = manifests.find((x) => x.id === manifestId);
    if (!m) {
      return;
    }
    setSelectedWarehouse(m.warehouseId);
    writePreferredWarehouseId(m.warehouseId);
  }, [manifestId, manifests]);

  const grandSummary = useMemo(() => {
    let totalKg = 0;
    let packagesSum = 0;
    let packagesKnown = 0;
    const byWarehouse = new Map<string, { kg: number; manifests: number }>();
    const byDestination = new Map<string, { kg: number; manifests: number }>();

    for (const m of filteredManifests) {
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
      count: filteredManifests.length,
      totalKg,
      packagesSum: packagesKnown > 0 ? packagesSum : null,
      byWarehouse: [...byWarehouse.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")),
      byDestination: [...byDestination.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")),
    };
  }, [filteredManifests]);

  const detail = detailQuery.data?.manifest;

  const assignTrip = useMutation({
    mutationFn: async () => {
      if (!manifestId.trim() || !assignTripId.trim()) {
        throw new Error("Выберите рейс для привязки.");
      }
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(manifestId)}/assign-trip`, { tripId: assignTripId.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["loading-manifest"] });
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });

  return (
    <section className="birzha-card" aria-labelledby="admin-loading-manifests-h">
      <h2 id="admin-loading-manifests-h" style={{ margin: "0 0 0.65rem", fontSize: "1.08rem" }}>
        Погрузка
      </h2>

      {listQuery.isPending ? (
        <LoadingBlock label="Загрузка списка накладных…" minHeight={80} skeleton skeletonRows={5} />
      ) : null}
      {listQuery.isError ? (
        <p style={errorText} role="alert">
          Не удалось загрузить список погрузочных накладных.
        </p>
      ) : null}

      {listQuery.data && (
        <>
          {manifests.length === 0 ? (
            <BirzhaEmptyState compact title="Нет сохранённых накладных" />
          ) : (
            <>
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
                >
                  <option value="">— выберите склад —</option>
                  {warehouseOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedWarehouse ? (
                <BirzhaEmptyState
                  compact
                  title="Выберите склад"
                  description="Погрузочные накладные, сводка и рейсы ниже отображаются по выбранному складу."
                />
              ) : (
                <>
                  <BirzhaDisclosure
                    defaultOpen
                    title="Погрузочные накладные"
                    hint={
                      filteredManifests.length === 0
                        ? "на этом складе пусто"
                        : `${filteredManifests.length} шт. — раскройте строку`
                    }
                    bodyClassName="birzha-disclosure__body birzha-disclosure__body--stack"
                  >
                    {filteredManifests.length === 0 ? (
                      <BirzhaEmptyState compact title="На этом складе нет сохранённых накладных" />
                    ) : (
                      filteredManifests.map((m) => (
                        <ManifestAccordionBlock
                          key={m.id}
                          m={m}
                          manifestId={manifestId}
                          tripNumberById={tripNumberById}
                          detail={detail && detail.id === m.id ? detail : null}
                          detailLoading={Boolean(manifestId && manifestId === m.id && detailQuery.isPending)}
                          detailError={Boolean(manifestId && manifestId === m.id && detailQuery.isError)}
                          assignTripId={assignTripId}
                          setAssignTripId={setAssignTripId}
                          assignTrip={assignTrip}
                          trips={tripsQuery.data?.trips ?? []}
                        />
                      ))
                    )}
                  </BirzhaDisclosure>

                  <BirzhaDisclosure
                    defaultOpen
                    title="Общая сводка по погрузочным накладным на складе"
                    hint={
                      grandSummary.count === 0
                        ? "нет документов"
                        : `${grandSummary.count} док. · ${grandSummary.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`
                    }
                  >
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
  const tripLabel = m.tripId ? tripNumberById.get(m.tripId) ?? m.tripId : "—";
  const isOpen = manifestId === m.id;

  return (
    <details className="birzha-disclosure birzha-disclosure--nested" open={isOpen}>
      <summary className="birzha-disclosure__summary">
        <span>
          № <strong>{m.manifestNumber}</strong> · {m.docDate} · {m.warehouseName} ({m.warehouseCode}) · {m.destinationName} ·
          рейс: {tripLabel}
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
            <details className="birzha-disclosure birzha-disclosure--nested" open>
              <summary className="birzha-disclosure__summary">
                Привязка к рейсу
                <span className="birzha-disclosure__hint">
                  сейчас: {detail.tripId ? tripNumberById.get(detail.tripId) ?? detail.tripId : "не назначен"}
                </span>
              </summary>
              <div className="birzha-disclosure__body">
                <div className="no-print" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
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
                  <button type="button" style={btnStyle} disabled={assignTrip.isPending || !assignTripId} onClick={() => assignTrip.mutate()}>
                    {assignTrip.isPending ? "Привязка…" : "Привязать к рейсу"}
                  </button>
                </div>
                {assignTrip.isError ? (
                  <p style={errorText} role="alert">
                    {assignTrip.error instanceof Error ? assignTrip.error.message : String(assignTrip.error ?? "")}
                  </p>
                ) : null}
              </div>
            </details>

            <details className="birzha-disclosure birzha-disclosure--nested" open>
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
                        <tr key={line.batchId} title={`Партия: ${line.batchId}`}>
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
