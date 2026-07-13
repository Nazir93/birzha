import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { apiDeleteOr403, deleteLoadingManifestById, deleteTripById } from "../api/fetch-api.js";
import type {
  LoadingManifestSummary,
  PurchaseDocumentSummary,
  ShipmentReportResponse,
  TripJson,
  WarehouseJson,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip, canManageInventoryCatalog } from "../auth/role-panels.js";
import { isTripArchived } from "../format/archive.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import {
  formatTripArchiveSalesRevenue,
  formatTripArchiveSalesSoldKg,
} from "../format/trip-archive-sales-summary.js";
import { filterTripsAssignedToSellerForReports } from "../format/seller-workspace-trips.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { formatLoadingManifestDisplayName } from "../format/loading-manifest.js";
import { formatTripListStatusLabel } from "../format/trip-label.js";
import { ARCHIVE_LIST_PAGE_SIZE } from "../format/list-page-sizes.js";
import {
  loadingManifestsPagedQueryOptions,
  purchaseDocumentsPagedQueryOptions,
  shipmentReportQueryOptions,
  tripsPickerQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { refreshArchiveLists } from "../query/domain-list-refresh.js";
import {
  adminAwarePathForPath,
  adminRoutes,
  ops,
  prefix,
  purchaseNakladnayaDocumentPathForPath,
  sales,
} from "../routes.js";
import { ArchivedTripSalesReport } from "./ArchivedTripSalesReport.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { tableStyle, thHead, thtd, fieldStyle } from "../ui/styles.js";

const PAGE_SIZE = ARCHIVE_LIST_PAGE_SIZE;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function formatTripDepartedRu(departedAt: string | null): string {
  if (!departedAt?.trim()) {
    return "—";
  }
  const d = new Date(departedAt);
  if (Number.isNaN(d.getTime())) {
    return departedAt;
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Отчёт по продажам прямо в архиве (сводка + журнал сделок). */
function archiveSalesReportPath(pathname: string, tripId: string, salesMode: boolean): string {
  const base = salesMode ? sales.archive : adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);
  return `${base}?${new URLSearchParams({ trip: tripId }).toString()}`;
}

function fullTripReportPath(pathname: string, tripId: string, salesMode: boolean): string {
  const base = salesMode ? sales.reports : adminAwarePathForPath(pathname, adminRoutes.reports, ops.reports);
  return `${base}?${new URLSearchParams({ trip: tripId }).toString()}`;
}

function manifestPathFor(pathname: string, manifestId: string): string {
  return `${adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution)}/${encodeURIComponent(manifestId)}`;
}

function ArchiveDataTable({
  ariaLabel,
  headers,
  rows,
}: {
  ariaLabel: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
      <table style={tableStyle} aria-label={ariaLabel}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" style={thHead}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} style={thtd}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginatedSection({
  title,
  count,
  defaultOpen,
  emptyTitle,
  emptyDescription,
  pageCount,
  pageIndex,
  itemLabel,
  onPageChange,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  pageCount: number;
  pageIndex: number;
  itemLabel: string;
  onPageChange: (p: number) => void;
  children: ReactNode;
}) {
  return (
    <BirzhaDisclosure
      title={
        <span>
          {title}
          <span className="birzha-text-muted" style={{ fontWeight: 400 }}>
            {" "}
            ({count})
          </span>
        </span>
      }
      defaultOpen={defaultOpen ?? count > 0}
    >
      {count === 0 ? (
        <BirzhaEmptyState compact title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {children}
          {pageCount > 1 ? (
            <BirzhaPagination pageIndex={pageIndex} pageCount={pageCount} itemLabel={itemLabel} onPageChange={onPageChange} />
          ) : null}
        </>
      )}
    </BirzhaDisclosure>
  );
}

function NakladnayaArchiveTable({
  docs,
  pathname,
  warehouses,
  startIndex,
  canDelete,
  deletingId,
  onDelete,
}: {
  docs: readonly PurchaseDocumentSummary[];
  pathname: string;
  warehouses: readonly WarehouseJson[];
  startIndex: number;
  canDelete: boolean;
  deletingId: string | null;
  onDelete: (doc: PurchaseDocumentSummary) => void;
}) {
  const whById = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name || w.code])), [warehouses]);
  const headers = canDelete
    ? ["№", "Дата", "№ документа", "Склад", "", ""]
    : ["№", "Дата", "№ документа", "Склад", ""];
  return (
    <ArchiveDataTable
      ariaLabel="Архив закупочных накладных"
      headers={headers}
      rows={docs.map((d, idx) => {
        const cells: ReactNode[] = [
          String(startIndex + idx),
          formatPurchaseDocDateRu(d.docDate),
          <Link key="doc" to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontWeight: 700 }}>
            {d.documentNumber}
          </Link>,
          whById.get(d.warehouseId) ?? "—",
          <Link key="open" to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)}>
            Открыть
          </Link>,
        ];
        if (canDelete) {
          cells.push(
            <button
              key="delete"
              type="button"
              className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
              disabled={deletingId != null}
              onClick={() => onDelete(d)}
            >
              {deletingId === d.id ? "…" : "Удалить"}
            </button>,
          );
        }
        return cells;
      })}
    />
  );
}

function ManifestArchiveTable({
  manifests,
  pathname,
  tripNumberById,
  startIndex,
  canDelete,
  deletingId,
  onDelete,
}: {
  manifests: readonly LoadingManifestSummary[];
  pathname: string;
  tripNumberById: Map<string, string>;
  startIndex: number;
  canDelete: boolean;
  deletingId: string | null;
  onDelete: (manifest: LoadingManifestSummary) => void;
}) {
  const headers = canDelete
    ? ["№", "Дата", "Накладная", "Склад", "Рейс", "", ""]
    : ["№", "Дата", "Накладная", "Склад", "Рейс", ""];
  return (
    <ArchiveDataTable
      ariaLabel="Архив погрузочных накладных"
      headers={headers}
      rows={manifests.map((m, idx) => {
        const cells: ReactNode[] = [
          String(startIndex + idx),
          formatPurchaseDocDateRu(m.docDate),
          <Link key="n" to={manifestPathFor(pathname, m.id)} style={{ fontWeight: 700 }}>
            {formatLoadingManifestDisplayName({
              manifestNumber: m.manifestNumber,
              destinationName: m.destinationName,
            })}
          </Link>,
          `${m.warehouseName}`,
          m.tripId ? (tripNumberById.get(m.tripId) ?? "—") : "—",
          <Link key="o" to={manifestPathFor(pathname, m.id)}>
            Открыть
          </Link>,
        ];
        if (canDelete) {
          cells.push(
            <button
              key="delete"
              type="button"
              className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
              disabled={deletingId != null}
              onClick={() => onDelete(m)}
            >
              {deletingId === m.id ? "…" : "Удалить"}
            </button>,
          );
        }
        return cells;
      })}
    />
  );
}

function TripsArchiveTable({
  trips,
  reportTo,
  reportByTripId,
  reportLoadingTripIds,
  startIndex,
  canDelete,
  deletingId,
  onDelete,
}: {
  trips: readonly TripJson[];
  reportTo: (tripId: string) => string;
  reportByTripId: ReadonlyMap<string, ShipmentReportResponse>;
  reportLoadingTripIds: ReadonlySet<string>;
  startIndex: number;
  canDelete: boolean;
  deletingId: string | null;
  onDelete: (trip: TripJson) => void;
}) {
  const headers = canDelete
    ? ["№", "Дата выезда", "№ рейса", "Статус", "Продано", "Выручка", "ТС / водитель", "", ""]
    : ["№", "Дата выезда", "№ рейса", "Статус", "Продано", "Выручка", "ТС / водитель", ""];
  return (
    <ArchiveDataTable
      ariaLabel="Архив рейсов"
      headers={headers}
      rows={trips.map((t, idx) => {
        const rep = reportByTripId.get(t.id);
        const loading = reportLoadingTripIds.has(t.id);
        const cells: ReactNode[] = [
          String(startIndex + idx),
          formatTripDepartedRu(t.departedAt),
          <Link key="n" to={reportTo(t.id)} style={{ fontWeight: 700 }}>
            {t.tripNumber}
          </Link>,
          formatTripListStatusLabel(t),
          formatTripArchiveSalesSoldKg(rep, loading),
          formatTripArchiveSalesRevenue(rep, loading),
          [t.vehicleLabel, t.driverName].filter(Boolean).join(" · ") || "—",
          <Link key="r" to={reportTo(t.id)}>
            Все продажи
          </Link>,
        ];
        if (canDelete) {
          cells.push(
            <button
              key="delete"
              type="button"
              className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
              disabled={deletingId != null}
              onClick={() => onDelete(t)}
            >
              {deletingId === t.id ? "…" : "Удалить"}
            </button>,
          );
        }
        return cells;
      })}
    />
  );
}

/** Закрытые рейсы, проданные закупочные и погрузочные по закрытым рейсам — только здесь. */
export function ArchivePage() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { user, meta } = useAuth();
  const queryClient = useQueryClient();
  const salesMode = pathname === prefix.sales || pathname.startsWith(`${prefix.sales}/`);
  const reportTripId = searchParams.get("trip")?.trim() ?? "";

  const canDeletePurchase = !salesMode && user != null && canManageInventoryCatalog(user);
  const canDeleteManifest = canDeletePurchase;
  const canDeleteTrip = user != null && canCreateTrip(user);

  const [tripsPage, setTripsPage] = useState(0);
  const [nakladPage, setNakladPage] = useState(0);
  const [manifestPage, setManifestPage] = useState(0);
  const [nakladSearch, setNakladSearch] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [deletingManifestId, setDeletingManifestId] = useState<string | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const nakladSearchDebounced = useDebouncedValue(nakladSearch.trim(), 280);

  const invalidateArchive = useCallback(async () => {
    await refreshArchiveLists(queryClient);
  }, [queryClient]);

  const deletePurchaseDocument = useMutation({
    mutationFn: async (documentId: string) => {
      setPageError(null);
      setDeletingPurchaseId(documentId);
      await apiDeleteOr403(
        `/api/purchase-documents/${encodeURIComponent(documentId)}`,
        "Недостаточно прав: удаление накладных — только admin.",
      );
    },
    onSuccess: async () => {
      await invalidateArchive();
    },
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
    onSettled: () => setDeletingPurchaseId(null),
  });

  const deleteLoadingManifest = useMutation({
    mutationFn: async (manifestId: string) => {
      setPageError(null);
      setDeletingManifestId(manifestId);
      await deleteLoadingManifestById(
        manifestId,
        "Недостаточно прав: удаление погрузочных накладных — только admin.",
        { fromArchive: true },
      );
    },
    onSuccess: async () => {
      await invalidateArchive();
    },
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
    onSettled: () => setDeletingManifestId(null),
  });

  const deleteTrip = useMutation({
    mutationFn: async (tripId: string) => {
      setPageError(null);
      setDeletingTripId(tripId);
      await deleteTripById(tripId, "Недостаточно прав на удаление рейса.", { fromArchive: true });
    },
    onSuccess: async () => {
      await invalidateArchive();
    },
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
    onSettled: () => setDeletingTripId(null),
  });

  useEffect(() => {
    setNakladPage(0);
    setManifestPage(0);
  }, [nakladSearchDebounced]);

  const tripsQ = useQuery(
    tripsPickerQueryOptions({
      limit: PAGE_SIZE,
      offset: tripsPage * PAGE_SIZE,
      status: "closed",
    }),
  );
  const purchaseQ = useQuery({
    ...purchaseDocumentsPagedQueryOptions({
      limit: PAGE_SIZE,
      offset: nakladPage * PAGE_SIZE,
      scope: "archived",
      search: nakladSearchDebounced || undefined,
    }),
    enabled: !salesMode && meta?.purchaseDocumentsApi === "enabled",
  });
  const manifestsQ = useQuery({
    ...loadingManifestsPagedQueryOptions({
      limit: PAGE_SIZE,
      offset: manifestPage * PAGE_SIZE,
      scope: "archived",
      search: nakladSearchDebounced || undefined,
    }),
    enabled: !salesMode,
  });
  const warehousesQ = useQuery({
    ...warehousesFullListQueryOptions(),
    enabled: !salesMode,
  });


  const archivedTrips = useMemo(() => {
    let list = tripsQ.data?.trips ?? [];
    if (salesMode && user) {
      list = filterTripsAssignedToSellerForReports(list, user.id);
    }
    return list;
  }, [tripsQ.data?.trips, salesMode, user]);

  const archivedNaklad = purchaseQ.data?.purchaseDocuments ?? [];
  const archivedTripTotal = tripsQ.data?.listMeta?.totalCount ?? archivedTrips.length;
  const archivedNakladTotal = purchaseQ.data?.listMeta?.totalCount ?? archivedNaklad.length;

  const archivedManifests = manifestsQ.data?.loadingManifests ?? [];
  const archivedManifestTotal = manifestsQ.data?.listMeta?.totalCount ?? archivedManifests.length;
  const archivedManifestPageCount = Math.max(1, Math.ceil(archivedManifestTotal / PAGE_SIZE));

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQ.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQ.data?.trips]);

  const tripsPaged = useMemo(
    () => ({
      slice: archivedTrips,
      pageCount: Math.max(1, Math.ceil(archivedTripTotal / PAGE_SIZE)),
    }),
    [archivedTrips, archivedTripTotal],
  );
  const nakladPaged = useMemo(
    () => ({
      slice: archivedNaklad,
      pageCount: Math.max(1, Math.ceil(archivedNakladTotal / PAGE_SIZE)),
    }),
    [archivedNaklad, archivedNakladTotal],
  );

  useEffect(() => {
    setTripsPage((p) => Math.min(p, Math.max(0, tripsPaged.pageCount - 1)));
  }, [archivedTrips.length, tripsPaged.pageCount]);
  useEffect(() => {
    setNakladPage((p) => Math.min(p, Math.max(0, nakladPaged.pageCount - 1)));
  }, [archivedNaklad.length, nakladPaged.pageCount]);
  useEffect(() => {
    setManifestPage((p) => Math.min(p, Math.max(0, archivedManifestPageCount - 1)));
  }, [archivedManifestTotal, archivedManifestPageCount]);

  const loading = tripsQ.isPending || (!salesMode && (manifestsQ.isPending || purchaseQ.isPending));
  const reportTo = (tripId: string) => archiveSalesReportPath(pathname, tripId, salesMode);

  const selectedArchivedTrip = useMemo(() => {
    if (!reportTripId) {
      return null;
    }
    const fromList = archivedTrips.find((t) => t.id === reportTripId);
    if (fromList) {
      return fromList;
    }
    const t = (tripsQ.data?.trips ?? []).find((x) => x.id === reportTripId);
    if (!t || !isTripArchived(t)) {
      return null;
    }
    if (salesMode && user && !filterTripsAssignedToSellerForReports([t], user.id).length) {
      return null;
    }
    return t;
  }, [archivedTrips, reportTripId, salesMode, tripsQ.data?.trips, user]);

  const tripIdsForArchiveSummaries = useMemo(() => {
    const ids = new Set(tripsPaged.slice.map((t) => t.id));
    if (reportTripId) {
      ids.add(reportTripId);
    }
    return [...ids];
  }, [reportTripId, tripsPaged.slice]);

  const archiveReportQueries = useQueries({
    queries: tripIdsForArchiveSummaries.map((tripId) => ({
      ...shipmentReportQueryOptions(tripId),
      enabled: !tripsQ.isPending && tripId.length > 0,
    })),
  });

  const reportByTripId = useMemo(() => {
    const m = new Map<string, ShipmentReportResponse>();
    for (let i = 0; i < tripIdsForArchiveSummaries.length; i++) {
      const data = archiveReportQueries[i]?.data;
      if (data) {
        m.set(tripIdsForArchiveSummaries[i]!, data);
      }
    }
    return m;
  }, [archiveReportQueries, tripIdsForArchiveSummaries]);

  const reportLoadingTripIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < tripIdsForArchiveSummaries.length; i++) {
      if (archiveReportQueries[i]?.isPending) {
        s.add(tripIdsForArchiveSummaries[i]!);
      }
    }
    return s;
  }, [archiveReportQueries, tripIdsForArchiveSummaries]);

  return (
    <section className="birzha-card birzha-section-shell" aria-labelledby="archive-heading">
      <h2 id="archive-heading" className="birzha-section-title-main">
        Архив
      </h2>

      {pageError ? <ErrorAlert message={pageError} title="Ошибка" /> : null}

      {loading && <LoadingBlock label="Загрузка архива…" minHeight={80} skeleton skeletonRows={5} />}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {!salesMode ? (
            <BirzhaDisclosure defaultOpen title="Поиск накладной">
              <label className="birzha-field-label" htmlFor="archive-naklad-search">
                № закупочной или погрузочной накладной
              </label>
              <input
                id="archive-naklad-search"
                value={nakladSearch}
                onChange={(e) => setNakladSearch(e.target.value)}
                style={{ ...fieldStyle, maxWidth: "24rem" }}
                placeholder="Например Н-2024-001"
                autoComplete="off"
              />
              {nakladSearch.trim() !== nakladSearchDebounced ? (
                <p className="birzha-text-muted birzha-text-muted--micro" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                  Ищем…
                </p>
              ) : null}
            </BirzhaDisclosure>
          ) : null}

          {reportTripId ? (
            selectedArchivedTrip ? (
              <ArchivedTripSalesReport
                tripId={selectedArchivedTrip.id}
                tripNumber={selectedArchivedTrip.tripNumber}
                fullReportPath={
                  salesMode ? undefined : fullTripReportPath(pathname, selectedArchivedTrip.id, salesMode)
                }
              />
            ) : (
              <BirzhaEmptyState
                compact
                title="Рейс не найден в архиве"
                description="Возможно, рейс ещё открыт или у вас нет доступа к этому рейсу."
              />
            )
          ) : null}

          <PaginatedSection
            title="Рейсы"
            count={archivedTripTotal}
            defaultOpen
            emptyTitle="Архив рейсов пуст"
            emptyDescription="После закрытия рейса он появится здесь с полным отчётом по продажам."
            pageCount={tripsPaged.pageCount}
            pageIndex={tripsPage}
            itemLabel="рейсов"
            onPageChange={setTripsPage}
          >
            <TripsArchiveTable
              trips={tripsPaged.slice}
              reportTo={reportTo}
              reportByTripId={reportByTripId}
              reportLoadingTripIds={reportLoadingTripIds}
              startIndex={tripsPage * PAGE_SIZE + 1}
              canDelete={canDeleteTrip}
              deletingId={deletingTripId}
              onDelete={(trip) => {
                if (
                  window.confirm(
                    `Удалить закрытый рейс «${trip.tripNumber}» из архива вместе с журналом отгрузок, продаж и погрузочных накладных? Действие необратимо.`,
                  )
                ) {
                  void deleteTrip.mutate(trip.id);
                }
              }}
            />
          </PaginatedSection>

          {!salesMode ? (
            <PaginatedSection
              key={nakladSearchDebounced ? `purchase-${nakladSearchDebounced}` : "purchase-default"}
              title="Закупочные накладные"
              count={archivedNakladTotal}
              defaultOpen={nakladSearchDebounced.length > 0 || archivedNakladTotal > 0}
              emptyTitle={nakladSearchDebounced ? "Ничего не найдено" : "Нет накладных в архиве"}
              emptyDescription={
                nakladSearchDebounced
                  ? `По запросу «${nakladSearchDebounced}» закупочных накладных в архиве нет.`
                  : "Когда по накладной не останется остатка по партиям, документ перенесётся сюда."
              }
              pageCount={nakladPaged.pageCount}
              pageIndex={nakladPage}
              itemLabel="накладных"
              onPageChange={setNakladPage}
            >
              <NakladnayaArchiveTable
                docs={nakladPaged.slice}
                pathname={pathname}
                warehouses={warehousesQ.data?.warehouses ?? []}
                startIndex={nakladPage * PAGE_SIZE + 1}
                canDelete={canDeletePurchase}
                deletingId={deletingPurchaseId}
                onDelete={(doc) => {
                  if (
                    window.confirm(
                      `Удалить накладную № ${doc.documentNumber} из архива и все связанные партии? Действие необратимо.`,
                    )
                  ) {
                    void deletePurchaseDocument.mutate(doc.id);
                  }
                }}
              />
            </PaginatedSection>
          ) : null}

          {!salesMode ? (
            <PaginatedSection
              key={nakladSearchDebounced ? `manifest-${nakladSearchDebounced}` : "manifest-default"}
              title="Погрузочные накладные"
              count={archivedManifestTotal}
              defaultOpen={nakladSearchDebounced.length > 0 || archivedManifestTotal > 0}
              emptyTitle={nakladSearchDebounced ? "Ничего не найдено" : "Нет погрузочных в архиве"}
              emptyDescription={
                nakladSearchDebounced
                  ? `По запросу «${nakladSearchDebounced}» погрузочных накладных в архиве нет.`
                  : "Погрузочные, привязанные к закрытому рейсу, отображаются здесь."
              }
              pageCount={archivedManifestPageCount}
              pageIndex={manifestPage}
              itemLabel="документов"
              onPageChange={setManifestPage}
            >
              <ManifestArchiveTable
                manifests={archivedManifests}
                pathname={pathname}
                tripNumberById={tripNumberById}
                startIndex={manifestPage * PAGE_SIZE + 1}
                canDelete={canDeleteManifest}
                deletingId={deletingManifestId}
                onDelete={(manifest) => {
                  if (
                    window.confirm(
                      `Удалить погрузочную накладную № ${manifest.manifestNumber} из архива? Журнал отгрузок в рейсе сохранится. Действие необратимо.`,
                    )
                  ) {
                    void deleteLoadingManifest.mutate(manifest.id);
                  }
                }}
              />
            </PaginatedSection>
          ) : null}
        </div>
      )}
    </section>
  );
}
