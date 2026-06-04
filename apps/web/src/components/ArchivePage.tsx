import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import type {
  LoadingManifestSummary,
  PurchaseDocumentSummary,
  ShipmentReportResponse,
  TripJson,
  WarehouseJson,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import {
  closedTripIdSet,
  filterPurchaseDocumentsArchived,
  filterTripsArchived,
  isTripArchived,
  splitLoadingManifestsByArchive,
} from "../format/archive.js";
import {
  formatTripArchiveSalesRevenue,
  formatTripArchiveSalesSoldKg,
} from "../format/trip-archive-sales-summary.js";
import { filterTripsAssignedToSellerForReports } from "../format/seller-workspace-trips.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { formatLoadingManifestDisplayName } from "../format/loading-manifest.js";
import { formatTripListStatusLabel } from "../format/trip-label.js";
import {
  batchesFullListQueryOptions,
  loadingManifestsListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  shipmentReportQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
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
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

const PAGE_SIZE = 25;

function formatTripDepartedRu(departedAt: string | null): string {
  if (!departedAt?.trim()) {
    return "—";
  }
  const d = new Date(departedAt);
  if (Number.isNaN(d.getTime())) {
    return departedAt;
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
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

function paginate<T>(items: readonly T[], pageIndex: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const start = pageIndex * pageSize;
  return { slice: items.slice(start, start + pageSize), pageCount };
}

function NakladnayaArchiveTable({
  docs,
  pathname,
  warehouses,
  startIndex,
}: {
  docs: readonly PurchaseDocumentSummary[];
  pathname: string;
  warehouses: readonly WarehouseJson[];
  startIndex: number;
}) {
  const whById = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name || w.code])), [warehouses]);
  return (
    <ArchiveDataTable
      ariaLabel="Архив закупочных накладных"
      headers={["№", "Дата", "№ документа", "Склад", ""]}
      rows={docs.map((d, idx) => [
        String(startIndex + idx),
        formatPurchaseDocDateRu(d.docDate),
        <Link key="doc" to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontWeight: 700 }}>
          {d.documentNumber}
        </Link>,
        whById.get(d.warehouseId) ?? "—",
        <Link key="open" to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)}>
          Открыть
        </Link>,
      ])}
    />
  );
}

function ManifestArchiveTable({
  manifests,
  pathname,
  tripNumberById,
  startIndex,
}: {
  manifests: readonly LoadingManifestSummary[];
  pathname: string;
  tripNumberById: Map<string, string>;
  startIndex: number;
}) {
  return (
    <ArchiveDataTable
      ariaLabel="Архив погрузочных накладных"
      headers={["№", "Дата", "№", "Склад", "Рейс", ""]}
      rows={manifests.map((m, idx) => [
        String(startIndex + idx),
        formatPurchaseDocDateRu(m.docDate),
        <Link key="n" to={manifestPathFor(pathname, m.id)} style={{ fontWeight: 700 }}>
          {formatLoadingManifestDisplayName({
            manifestNumber: m.manifestNumber,
            destinationName: m.destinationName,
          })}
        </Link>,
        `${m.warehouseName} (${m.warehouseCode})`,
        m.tripId ? (tripNumberById.get(m.tripId) ?? "—") : "—",
        <Link key="o" to={manifestPathFor(pathname, m.id)}>
          Открыть
        </Link>,
      ])}
    />
  );
}

function TripsArchiveTable({
  trips,
  reportTo,
  reportByTripId,
  reportLoadingTripIds,
  startIndex,
}: {
  trips: readonly TripJson[];
  reportTo: (tripId: string) => string;
  reportByTripId: ReadonlyMap<string, ShipmentReportResponse>;
  reportLoadingTripIds: ReadonlySet<string>;
  startIndex: number;
}) {
  return (
    <ArchiveDataTable
      ariaLabel="Архив рейсов"
      headers={["№", "Дата выезда", "№ рейса", "Статус", "Продано", "Выручка", "ТС / водитель", ""]}
      rows={trips.map((t, idx) => {
        const rep = reportByTripId.get(t.id);
        const loading = reportLoadingTripIds.has(t.id);
        return [
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
      })}
    />
  );
}

/** Закрытые рейсы, проданные закупочные и погрузочные по закрытым рейсам — только здесь. */
export function ArchivePage() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { user, meta } = useAuth();
  const salesMode = pathname === prefix.sales || pathname.startsWith(`${prefix.sales}/`);
  const reportTripId = searchParams.get("trip")?.trim() ?? "";

  const tripsQ = useQuery(tripsFullListQueryOptions());
  const batchesQ = useQuery(batchesFullListQueryOptions());
  const purchaseQ = useQuery({
    ...purchaseDocumentsFullListQueryOptions(),
    enabled: !salesMode && meta?.purchaseDocumentsApi === "enabled",
  });
  const manifestsQ = useQuery({
    ...loadingManifestsListQueryOptions(),
    enabled: !salesMode,
  });
  const warehousesQ = useQuery({
    ...warehousesFullListQueryOptions(),
    enabled: !salesMode,
  });

  const closedIds = useMemo(() => closedTripIdSet(tripsQ.data?.trips ?? []), [tripsQ.data?.trips]);

  const archivedTrips = useMemo(() => {
    let list = filterTripsArchived(tripsQ.data?.trips ?? []);
    if (salesMode && user) {
      list = filterTripsAssignedToSellerForReports(list, user.id);
    }
    return list;
  }, [tripsQ.data?.trips, salesMode, user]);

  const archivedNaklad = useMemo(() => {
    if (salesMode || !batchesQ.isSuccess || !purchaseQ.data) {
      return [];
    }
    return filterPurchaseDocumentsArchived(purchaseQ.data.purchaseDocuments, batchesQ.data.batches);
  }, [salesMode, batchesQ.isSuccess, batchesQ.data?.batches, purchaseQ.data]);

  const archivedManifests = useMemo(() => {
    if (salesMode) {
      return [];
    }
    return splitLoadingManifestsByArchive(manifestsQ.data?.loadingManifests ?? [], closedIds).archived;
  }, [salesMode, manifestsQ.data?.loadingManifests, closedIds]);

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQ.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQ.data?.trips]);

  const [tripsPage, setTripsPage] = useState(0);
  const [nakladPage, setNakladPage] = useState(0);
  const [manifestPage, setManifestPage] = useState(0);

  const tripsPaged = useMemo(() => paginate(archivedTrips, tripsPage, PAGE_SIZE), [archivedTrips, tripsPage]);
  const nakladPaged = useMemo(() => paginate(archivedNaklad, nakladPage, PAGE_SIZE), [archivedNaklad, nakladPage]);
  const manifestPaged = useMemo(
    () => paginate(archivedManifests, manifestPage, PAGE_SIZE),
    [archivedManifests, manifestPage],
  );

  useEffect(() => {
    setTripsPage((p) => Math.min(p, Math.max(0, tripsPaged.pageCount - 1)));
  }, [archivedTrips.length, tripsPaged.pageCount]);
  useEffect(() => {
    setNakladPage((p) => Math.min(p, Math.max(0, nakladPaged.pageCount - 1)));
  }, [archivedNaklad.length, nakladPaged.pageCount]);
  useEffect(() => {
    setManifestPage((p) => Math.min(p, Math.max(0, manifestPaged.pageCount - 1)));
  }, [archivedManifests.length, manifestPaged.pageCount]);

  const loading = tripsQ.isPending || batchesQ.isPending;
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

      {loading && <LoadingBlock label="Загрузка архива…" minHeight={80} skeleton skeletonRows={5} />}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
            count={archivedTrips.length}
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
            />
          </PaginatedSection>

          {!salesMode ? (
            <PaginatedSection
              title="Закупочные накладные"
              count={archivedNaklad.length}
              emptyTitle="Нет накладных в архиве"
              emptyDescription="Когда по накладной не останется остатка по партиям, документ перенесётся сюда."
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
              />
            </PaginatedSection>
          ) : null}

          {!salesMode ? (
            <PaginatedSection
              title="Погрузочные накладные"
              count={archivedManifests.length}
              emptyTitle="Нет погрузочных в архиве"
              emptyDescription="Погрузочные, привязанные к закрытому рейсу, отображаются здесь."
              pageCount={manifestPaged.pageCount}
              pageIndex={manifestPage}
              itemLabel="документов"
              onPageChange={setManifestPage}
            >
              <ManifestArchiveTable
                manifests={manifestPaged.slice}
                pathname={pathname}
                tripNumberById={tripNumberById}
                startIndex={manifestPage * PAGE_SIZE + 1}
              />
            </PaginatedSection>
          ) : null}
        </div>
      )}
    </section>
  );
}
