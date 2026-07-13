import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { apiPostJson, deleteWarehouseWriteOffById, postBatchWarehouseWriteOffQualityReject } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canShipLoadingManifest } from "../auth/role-panels.js";
import { formatLoadingManifestDisplayName } from "../format/loading-manifest.js";
import { formatAllocationWarehouseSelectLabel } from "../format/allocation-warehouse-option.js";
import { isLoadingManifestNotFoundError, humanizeErrorMessage } from "../format/user-facing-error.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import { queryRoots } from "../query/core-list-queries.js";
import { refreshDistributionLists } from "../query/domain-list-refresh.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { btnClassSpaced, selectFieldStyle } from "../ui/styles.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { DistributionCreateForm } from "./distribution/DistributionCreateForm.js";
import { DistributionManifestListTable } from "./distribution/DistributionManifestListTable.js";
import type { RecentWriteOffRow } from "./distribution/WriteOffRecentList.js";
import { useDistributionWorkspace } from "./distribution/useDistributionWorkspace.js";
import { loadingSummaryFromDetail } from "./loading-manifest/loading-summary-from-detail.js";
import { LoadingManifestBlock } from "./LoadingManifestBlock.js";

export function LoadingAppendPanel() {
  const { manifestId: routeManifestId = "" } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const canShip = canShipLoadingManifest(user);
  const appendBase = adminAwarePathForPath(pathname, adminRoutes.loadingAppend, ops.loadingAppend);
  const distributionBase = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const queryClient = useQueryClient();

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [loadNaklSelection, setLoadNaklSelection] = useState<Set<string>>(() => new Set());
  const [manifestFormOpen, setManifestFormOpen] = useState(false);
  const [manifestListPage, setManifestListPage] = useState(0);
  const [rejectScrapInput, setRejectScrapInput] = useState<Record<string, string>>({});
  const [rejectScrapPkgInput, setRejectScrapPkgInput] = useState<Record<string, string>>({});
  const [recentWriteOffs, setRecentWriteOffs] = useState<RecentWriteOffRow[]>([]);
  const [writeOffUndoError, setWriteOffUndoError] = useState<string | null>(null);
  const [undoingWriteOffId, setUndoingWriteOffId] = useState<string | null>(null);

  const appendTargetManifestId = routeManifestId.trim() || null;

  const workspace = useDistributionWorkspace({
    routeManifestId,
    selectedWarehouse,
    manifestListPage,
    savedManifestId: "",
    appendTargetManifestId,
    loadNaklSelection,
    distributionBase: appendBase,
    workspaceMode: "append",
  });

  const {
    batchesQueryError,
    batchesQueryErrorMessage,
    routeDetailQuery,
    reservedBatchIdsQuery,
    loading,
    refetching,
    list,
    allocationWarehouseOptions,
    showWorkspace,
    selectedWarehouseRow,
    batchesInWh,
    documentOptions,
    manifestDocumentOptions,
    tableRows,
    tableRowsTotalKg,
    manifestListTotal,
    manifestListPageCount,
    distributionManifestListReady,
    allActiveManifestsSorted,
    tripNumberById,
    appendTargetManifest: appendTargetFromWorkspace,
    appendMode,
    routeDetail,
    viewingArchivedManifest,
    warehouseName,
    activeManifestId,
  } = workspace;

  const appendTargetManifest = useMemo(() => {
    if (!appendTargetManifestId) {
      return null;
    }
    const fromList = allActiveManifestsSorted.find((m) => m.id === appendTargetManifestId);
    if (fromList) {
      return fromList;
    }
    if (routeDetail && routeDetail.id === appendTargetManifestId) {
      return loadingSummaryFromDetail(routeDetail);
    }
    return appendTargetFromWorkspace;
  }, [allActiveManifestsSorted, appendTargetFromWorkspace, appendTargetManifestId, routeDetail]);

  const appendManifestSummary = appendTargetManifest;

  const writeOff = useMutation({
    mutationFn: async ({
      items,
      label,
    }: {
      inputKey: string;
      items: { batchId: string; kg: number }[];
      label: string;
    }) => {
      const entries: RecentWriteOffRow[] = [];
      for (const item of items) {
        const { writeOffId } = await postBatchWarehouseWriteOffQualityReject(item.batchId, item.kg);
        entries.push({ writeOffId, kg: item.kg, label });
      }
      return { entries };
    },
    onSuccess: (result, { inputKey }) => {
      setWriteOffUndoError(null);
      setRejectScrapInput((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      setRejectScrapPkgInput((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      setRecentWriteOffs((prev) => [...prev, ...result.entries]);
      void refreshDistributionLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryRoots.warehouseWriteOffsLedger });
    },
  });

  const undoWriteOff = useMutation({
    mutationFn: async (writeOffId: string) => {
      setWriteOffUndoError(null);
      setUndoingWriteOffId(writeOffId);
      await deleteWarehouseWriteOffById(writeOffId);
    },
    onSuccess: (_data, writeOffId) => {
      setRecentWriteOffs((prev) => prev.filter((r) => r.writeOffId !== writeOffId));
      void refreshDistributionLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryRoots.warehouseWriteOffsLedger });
    },
    onError: (e: unknown) => setWriteOffUndoError(humanizeErrorMessage(e)),
    onSettled: () => setUndoingWriteOffId(null),
  });

  const appendManifest = useMutation({
    mutationFn: async (payload: {
      appendToManifestId: string;
      warehouseId: string;
      destinationCode: string;
      batchIds: string[];
      docDate: string;
      manifestNumber: string;
    }) => {
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(payload.appendToManifestId)}/add-batches`, {
        batchIds: payload.batchIds,
      });
      return payload.appendToManifestId;
    },
    onSuccess: (manifestId) => {
      setLoadNaklSelection(new Set());
      setManifestFormOpen(false);
      setSelectedWarehouse("");
      writePreferredWarehouseId(null);
      void refreshDistributionLists(queryClient);
      void navigate(`${appendBase}/${encodeURIComponent(manifestId)}`);
    },
  });

  useEffect(() => {
    if (selectedWarehouse !== "" || allocationWarehouseOptions.length === 0 || !appendTargetManifestId) {
      return;
    }
    const pref = readPreferredWarehouseId();
    const withStock = allocationWarehouseOptions.filter((o) => o.batchCount > 0);
    if (withStock.length === 0) {
      return;
    }
    const pick = (pref ? withStock.find((o) => o.id === pref) : undefined) ?? withStock[0];
    if (pick) {
      setSelectedWarehouse(pick.id);
    }
  }, [allocationWarehouseOptions, selectedWarehouse, appendTargetManifestId]);

  useEffect(() => {
    setManifestFormOpen(false);
    setRejectScrapInput({});
    setRecentWriteOffs([]);
  }, [selectedWarehouse, routeManifestId]);

  const docIdKey = useMemo(
    () =>
      documentOptions
        .map((d) => d.id)
        .sort()
        .join(","),
    [documentOptions],
  );

  useEffect(() => {
    if (!docIdKey) {
      setLoadNaklSelection(new Set());
      return;
    }
    setLoadNaklSelection(new Set(docIdKey.split(",")));
  }, [selectedWarehouse, docIdKey]);

  const onToggleNaklDoc = useCallback((id: string) => {
    setLoadNaklSelection((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }, []);
  const onSelectAllNakl = useCallback(() => {
    setLoadNaklSelection(new Set(documentOptions.map((d) => d.id)));
  }, [documentOptions]);
  const onClearNakl = useCallback(() => {
    setLoadNaklSelection(new Set());
  }, []);

  const manifestDetailNotFound =
    Boolean(routeManifestId.trim()) &&
    routeDetailQuery.isError &&
    isLoadingManifestNotFoundError(routeDetailQuery.error);

  if (batchesQueryError) {
    return <ErrorAlert message={batchesQueryErrorMessage ?? "Не удалось загрузить партии."} title="Партии" />;
  }

  return (
    <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="loading-append-heading" role="region" aria-label="Догрузка">
      <div className="birzha-section-heading">
        <div>
          <p className="birzha-section-heading__eyebrow">Логистика</p>
          <h3 id="loading-append-heading" className="birzha-section-title birzha-section-title--sm">
            Догрузка
          </h3>
        </div>
      </div>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem" }}>
        Выберите сохранённую погрузочную накладную и добавьте партии с любого склада. Первая погрузка — в разделе{" "}
        <Link to={distributionBase}>«Погрузка на машину»</Link>.
      </p>

      {loading && <LoadingBlock label="Загрузка…" minHeight={80} skeleton skeletonRows={4} />}
      <StaleDataNotice show={refetching} label="Обновление списка партий…" />

      {!loading && !routeManifestId.trim() && distributionManifestListReady ? (
        allActiveManifestsSorted.length > 0 ? (
          <DistributionManifestListTable
            manifests={allActiveManifestsSorted}
            totalCount={manifestListTotal}
            pageIndex={manifestListPage}
            pageCount={manifestListPageCount}
            distributionBase={appendBase}
            activeManifestId={activeManifestId}
            tripNumberById={tripNumberById}
            deletingManifestId={null}
            onPageChange={setManifestListPage}
            onDelete={() => undefined}
            openLinkLabel="Догрузить"
            openLinkLabelCurrent="Выбрана"
            showDelete={false}
          />
        ) : (
          <BirzhaEmptyState
            compact
            title="Нет погрузочных для догрузки"
            description={
              <>
                Сначала создайте погрузочную в разделе <Link to={distributionBase}>«Погрузка на машину»</Link>.
              </>
            }
          />
        )
      ) : null}

      {routeManifestId.trim() ? (
        <p className="no-print birzha-section-backlink">
          <Link to={appendBase} style={{ fontWeight: 600 }}>
            ← К списку погрузочных
          </Link>
        </p>
      ) : null}

      {routeManifestId.trim() && manifestDetailNotFound ? (
        <BirzhaEmptyState
          title="Погрузочная накладная не найдена"
          description="Ссылка устарела или документ удалён."
          action={
            <Link to={appendBase} className="birzha-clean-ops-text-btn">
              ← К списку
            </Link>
          }
        />
      ) : null}

      {routeManifestId.trim() && viewingArchivedManifest ? (
        <InfoAlert title="Накладная в архиве">
          Рейс закрыт — догрузка недоступна. Откройте другую накладную из списка.
        </InfoAlert>
      ) : null}

      {routeManifestId.trim() && appendManifestSummary && !viewingArchivedManifest ? (
        <InfoAlert title="Погрузочная для догрузки">
          <strong>
            {formatLoadingManifestDisplayName({
              manifestNumber: appendManifestSummary.manifestNumber,
              destinationName: appendManifestSummary.destinationName,
            })}
          </strong>
          {appendManifestSummary.tripId ? (
            <>
              {" "}
              · рейс{" "}
              <strong>{tripNumberById.get(appendManifestSummary.tripId) ?? "—"}</strong>
            </>
          ) : (
            <> · рейс не привязан (можно привязать в разделе «Смена рейса»)</>
          )}
        </InfoAlert>
      ) : null}

      {routeManifestId.trim() && !viewingArchivedManifest && appendTargetManifestId && !manifestDetailNotFound ? (
        <>
          {!loading && allocationWarehouseOptions.length > 0 ? (
            <div className="no-print birzha-clean-ops-meta-grid birzha-clean-ops-meta-grid--warehouse">
              <label htmlFor="append-sel-warehouse" className="birzha-form-label">
                Склад для догрузки *
                <BirzhaSelect
                  id="append-sel-warehouse"
                  value={selectedWarehouse}
                  onChange={(v) => {
                    setSelectedWarehouse(v);
                    writePreferredWarehouseId(v === "" ? null : v);
                  }}
                  style={selectFieldStyle}
                  placeholder="— выберите склад —"
                  options={[
                    { value: "", label: "— выберите склад —" },
                    ...allocationWarehouseOptions.map((row) => ({
                      value: row.id,
                      label: formatAllocationWarehouseSelectLabel(warehouseName(row.id), row),
                    })),
                  ]}
                />
              </label>
              {selectedWarehouse ? (
                <div className="birzha-distribution-warehouse-meta birzha-form-label">
                  <span className="birzha-text-muted birzha-ui-sm">
                    Выбран: <strong>{warehouseName(selectedWarehouse)}</strong>
                    {selectedWarehouseRow != null ? ` · ${selectedWarehouseRow.batchCount} парт.` : null}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {showWorkspace && selectedWarehouse ? (
            <>
              <h4 className="birzha-clean-ops-list__title birzha-clean-ops-list__title--step">Отбор партий</h4>
              {documentOptions.length === 0 && batchesInWh.length > 0 ? (
                <p className="birzha-callout-info" role="status">
                  На складе нет привязки к номеру накладной — показаны все партии с остатком.
                </p>
              ) : null}
              <LoadingManifestBlock
                documentOptions={manifestDocumentOptions}
                selectedDocIds={loadNaklSelection}
                onToggleNaklDoc={onToggleNaklDoc}
                onSelectAllNakl={onSelectAllNakl}
                onClearNakl={onClearNakl}
                batchesInWh={batchesInWh}
                warehouseName={warehouseName(selectedWarehouse)}
                /* Отбор для догрузки — только склад; строки уже сохранённой ПН сюда не подмешиваем. */
                manifest={null}
                writeOff={
                  meta?.warehouseWriteOffApi === "enabled" && batchesInWh.length > 0
                    ? {
                        enabled: true,
                        isPending: writeOff.isPending,
                        isError: writeOff.isError,
                        errorMessage: writeOff.isError ? (writeOff.error as Error).message : null,
                        rejectInput: rejectScrapInput,
                        rejectPkgInput: rejectScrapPkgInput,
                        onRejectInputChange: (key, value) => setRejectScrapInput((prev) => ({ ...prev, [key]: value })),
                        onRejectPkgInputChange: (key, value) => setRejectScrapPkgInput((prev) => ({ ...prev, [key]: value })),
                        onSubmitWriteOff: (inputKey, items, label) => writeOff.mutate({ inputKey, items, label }),
                        recentWriteOffs,
                        undoingWriteOffId,
                        undoError: writeOffUndoError,
                        onUndoWriteOff: (writeOffId) => void undoWriteOff.mutate(writeOffId),
                      }
                    : null
                }
              />
              <p className="birzha-clean-ops-form-actions no-print">
                {tableRows.length > 0 ? (
                  <span className="birzha-text-muted birzha-ui-sm" style={{ width: "100%", marginBottom: "0.35rem" }}>
                    К догрузке: <strong>{tableRows.length}</strong> парт.,{" "}
                    <strong>{tableRowsTotalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг.
                  </span>
                ) : null}
                {canShip ? (
                  <button
                    type="button"
                    className={btnClassSpaced}
                    disabled={tableRows.length === 0}
                    onClick={() => setManifestFormOpen(true)}
                  >
                    Добавить в погрузочную
                  </button>
                ) : (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
                    Догрузка — у кладовщика или логиста.
                  </p>
                )}
              </p>
            </>
          ) : null}

          {!loading && selectedWarehouse && reservedBatchIdsQuery.isError ? (
            <p className="birzha-callout-warning" role="status">
              Не удалось загрузить учёт погрузочных — отбор может быть неполным.
            </p>
          ) : null}

          {!loading && list.length === 0 && selectedWarehouse && batchesInWh.length === 0 ? (
            <BirzhaEmptyState compact title="На складе нет свободных партий" description="Выберите другой склад." />
          ) : null}
        </>
      ) : null}

      {manifestFormOpen && selectedWarehouse && appendTargetManifest && canShip ? (
        <DistributionCreateForm
          appendMode={appendMode}
          appendTargetManifest={appendTargetManifest}
          onClose={() => setManifestFormOpen(false)}
          newManifestTripId=""
          onNewManifestTripIdChange={() => undefined}
          manifestDestinationCode={appendTargetManifest.destinationCode}
          onManifestDestinationCodeChange={() => undefined}
          manifestDate={appendTargetManifest.docDate}
          onManifestDateChange={() => undefined}
          destAllowed={[appendTargetManifest.destinationCode]}
          labelDest={{ [appendTargetManifest.destinationCode]: appendTargetManifest.destinationName }}
          openTripsForAssign={[]}
          tripsPending={false}
          selectedWarehouse={selectedWarehouse}
          tableRows={tableRows}
          takenManifestNumbers={[]}
          createPending={appendManifest.isPending}
          createError={appendManifest.isError ? appendManifest.error : null}
          tripsBase=""
          onSave={(payload) => {
            if (!payload.appendToManifestId) {
              return;
            }
            appendManifest.mutate({
              appendToManifestId: payload.appendToManifestId,
              warehouseId: payload.warehouseId,
              destinationCode: payload.destinationCode,
              batchIds: payload.batchIds,
              docDate: payload.docDate,
              manifestNumber: payload.manifestNumber,
            });
          }}
        />
      ) : null}
    </section>
  );
}
