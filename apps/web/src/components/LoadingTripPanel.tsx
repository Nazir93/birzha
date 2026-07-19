import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canShipLoadingManifest } from "../auth/role-panels.js";
import { filterTripsMatchingManifestDestination } from "../format/loading-manifest-trip-destination.js";
import { isLoadingManifestNotFoundError } from "../format/user-facing-error.js";
import { refreshDistributionLists } from "../query/domain-list-refresh.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { DistributionManifestListTable } from "./distribution/DistributionManifestListTable.js";
import { useDistributionWorkspace } from "./distribution/useDistributionWorkspace.js";
import { LoadingManifestAccordion } from "./loading-manifest/LoadingManifestAccordion.js";

export function LoadingTripPanel() {
  const { manifestId: routeManifestId = "" } = useParams();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const canShip = canShipLoadingManifest(user);
  const tripBase = adminAwarePathForPath(pathname, adminRoutes.loadingTrip, ops.loadingTrip);
  const distributionBase = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");
  const [manifestListPage, setManifestListPage] = useState(0);

  const workspace = useDistributionWorkspace({
    routeManifestId,
    selectedWarehouse: "",
    manifestListPage,
    savedManifestId: "",
    appendTargetManifestId: null,
    loadNaklSelection: new Set(),
    distributionBase: tripBase,
    workspaceMode: "trip",
  });

  const {
    loading,
    tripsQuery,
    routeDetailQuery,
    distributionManifestListReady,
    allActiveManifestsSorted,
    manifestListTotal,
    manifestListPageCount,
    tripNumberById,
    openTripsForAssign,
    openManifestSummary,
    routeDetail,
    viewingArchivedManifest,
    activeManifestId,
  } = workspace;

  useEffect(() => {
    setAssignTripId("");
  }, [routeManifestId]);

  const tripsMatchingManifestCity = useMemo(
    () =>
      filterTripsMatchingManifestDestination(
        openTripsForAssign,
        openManifestSummary?.destinationCode ?? routeDetail?.destinationCode,
      ),
    [openTripsForAssign, openManifestSummary?.destinationCode, routeDetail?.destinationCode],
  );

  const assignTrip = useMutation({
    mutationFn: async () => {
      const id = routeManifestId.trim();
      if (!id || !assignTripId.trim()) {
        throw new Error("Выберите рейс для привязки.");
      }
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(id)}/assign-trip`, {
        tripId: assignTripId.trim(),
      });
    },
    onSuccess: async () => {
      setAssignTripId("");
      await refreshDistributionLists(queryClient);
    },
  });

  const detachTrip = useMutation({
    mutationFn: async (manifestId: string) => {
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(manifestId)}/detach-trip`, {});
    },
    onSuccess: async () => {
      setAssignTripId("");
      await refreshDistributionLists(queryClient);
    },
  });

  const manifestDetailNotFound =
    Boolean(routeManifestId.trim()) &&
    routeDetailQuery.isError &&
    isLoadingManifestNotFoundError(routeDetailQuery.error);

  return (
    <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="loading-trip-heading" role="region" aria-label="Смена рейса">
      <div className="birzha-section-heading">
        <div>
          <p className="birzha-section-heading__eyebrow">Логистика</p>
          <h3 id="loading-trip-heading" className="birzha-section-title birzha-section-title--sm">
            Смена рейса
          </h3>
        </div>
      </div>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem" }}>
        Привязка, смена и открепление рейса для сохранённых погрузочных накладных. Можно сохранить ПН без рейса в{" "}
        <Link to={distributionBase}>«Погрузка на машину»</Link> и привязать здесь.
      </p>

      {loading && !distributionManifestListReady ? (
        <LoadingBlock label="Загрузка списка…" minHeight={64} skeleton skeletonRows={3} />
      ) : null}

      {!routeManifestId.trim() && distributionManifestListReady ? (
        allActiveManifestsSorted.length > 0 ? (
          <DistributionManifestListTable
            manifests={allActiveManifestsSorted}
            totalCount={manifestListTotal}
            pageIndex={manifestListPage}
            pageCount={manifestListPageCount}
            distributionBase={tripBase}
            activeManifestId={activeManifestId}
            tripNumberById={tripNumberById}
            deletingManifestId={null}
            onPageChange={setManifestListPage}
            onDelete={() => undefined}
            openLinkLabel="Сменить рейс"
            openLinkLabelCurrent="Открыта"
            showDelete={false}
          />
        ) : (
          <BirzhaEmptyState
            compact
            title="Нет погрузочных накладных"
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
          <Link to={tripBase} style={{ fontWeight: 600 }}>
            ← К списку погрузочных
          </Link>
        </p>
      ) : null}

      {!loading && tripsQuery.isError ? (
        <ErrorAlert error={tripsQuery.error} message="Не удалось загрузить рейсы." title="Рейсы" />
      ) : null}

      {routeManifestId.trim() && viewingArchivedManifest ? (
        <InfoAlert title="Накладная в архиве">Рейс закрыт — смена недоступна.</InfoAlert>
      ) : null}

      {routeManifestId.trim() && openManifestSummary && !viewingArchivedManifest ? (
        <LoadingManifestAccordion
          m={openManifestSummary}
          manifestId={routeManifestId.trim()}
          manifestBasePath={tripBase}
          tripNumberById={tripNumberById}
          detail={routeDetail && routeDetail.id === openManifestSummary.id ? routeDetail : null}
          detailLoading={routeDetailQuery.isPending}
          detailError={routeDetailQuery.isError && !manifestDetailNotFound}
          assignTripId={assignTripId}
          setAssignTripId={setAssignTripId}
          assignTrip={assignTrip}
          detachTrip={canShip ? detachTrip : undefined}
          trips={tripsMatchingManifestCity}
          canShipTrip={canShip}
          variant="trip"
        />
      ) : routeManifestId.trim() && routeDetailQuery.isPending ? (
        <LoadingBlock label="Загрузка…" minHeight={80} skeleton skeletonRows={3} />
      ) : manifestDetailNotFound ? (
        <BirzhaEmptyState
          title="Погрузочная накладная не найдена"
          description="Ссылка устарела или документ удалён."
          action={
            <Link to={tripBase} className="birzha-clean-ops-text-btn">
              ← К списку
            </Link>
          }
        />
      ) : routeManifestId.trim() && routeDetailQuery.isError ? (
        <ErrorAlert error={routeDetailQuery.error} message="Не удалось открыть накладную." title="Погрузочная" />
      ) : null}
    </section>
  );
}
