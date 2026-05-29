import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { apiDeleteOr403, deleteLoadingManifestById, deleteTripById } from "../api/fetch-api.js";
import {
  loadingManifestsListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes, purchaseNakladnayaDocumentPath } from "../routes.js";
import { formatTripListStatusLabel } from "../format/trip-label.js";
import { sortTripsByTripNumberNumericAsc } from "../format/trip-sort.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

type SettingsDocumentsAdminPanelProps = {
  embedded?: boolean;
};

function tripHasMovements(t: {
  hasShipmentToTrip?: boolean;
  shippedGrams?: string;
  soldGrams?: string;
}): boolean {
  if (t.hasShipmentToTrip) {
    return true;
  }
  const shipped = BigInt(t.shippedGrams?.trim() || "0");
  const sold = BigInt(t.soldGrams?.trim() || "0");
  return shipped > 0n || sold > 0n;
}

/** Настройки → Накладные: удаление закупочных, погрузочных и пустых рейсов. */
export function SettingsDocumentsAdminPanel({ embedded = false }: SettingsDocumentsAdminPanelProps = {}) {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const purchaseEnabled = meta?.purchaseDocumentsApi === "enabled";
  const tripsEnabled = meta?.tripsApi === "enabled";

  const [pageError, setPageError] = useState<string | null>(null);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.purchaseDocuments });
    void queryClient.invalidateQueries({ queryKey: queryRoots.loadingManifest });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  }, [queryClient]);

  const purchaseDocsQ = useQuery({ ...purchaseDocumentsFullListQueryOptions(), enabled: purchaseEnabled });
  const loadingManifestsQ = useQuery({ ...loadingManifestsListQueryOptions(), enabled: purchaseEnabled });
  const tripsQ = useQuery({ ...tripsFullListQueryOptions(), enabled: tripsEnabled });

  const deletePurchaseDocument = useMutation({
    mutationFn: async (documentId: string) => {
      setPageError(null);
      await apiDeleteOr403(
        `/api/purchase-documents/${encodeURIComponent(documentId)}`,
        "Недостаточно прав: удаление накладных — только admin.",
      );
    },
    onSuccess: invalidateAll,
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
  });

  const deleteLoadingManifest = useMutation({
    mutationFn: async (manifestId: string) => {
      setPageError(null);
      await deleteLoadingManifestById(manifestId, "Недостаточно прав: удаление погрузочных накладных — только admin.");
    },
    onSuccess: invalidateAll,
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
  });

  const deleteTrip = useMutation({
    mutationFn: async (tripId: string) => {
      setPageError(null);
      await deleteTripById(tripId, "Недостаточно прав на удаление рейса.");
    },
    onSuccess: invalidateAll,
    onError: (e: unknown) => setPageError(humanizeErrorMessage(e)),
  });

  const sortedTrips = sortTripsByTripNumberNumericAsc(tripsQ.data?.trips ?? []);

  return (
    <>
      {!embedded ? (
        <header className="birzha-home-hero birzha-settings-documents__hero">
          <div>
            <p className="birzha-home-hero__eyebrow">Администрирование</p>
            <h2 className="birzha-home-hero__title">Накладные и рейсы</h2>
          </div>
        </header>
      ) : null}

      {pageError ? <ErrorAlert message={pageError} title="Удаление" /> : null}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Закупки</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Закупочные накладные</span>
          </span>
        }
      >
        {purchaseDocsQ.isError ? <ErrorAlert error={purchaseDocsQ.error} title="Закупочные" /> : null}
        {purchaseDocsQ.isPending && (
          <LoadingBlock label="Список накладных…" minHeight={48} skeleton skeletonRows={3} />
        )}
        {purchaseDocsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>№</th>
                  <th style={thHeadDense}>Дата</th>
                  <th style={thHeadDense}>Строк</th>
                  <th style={thHeadDense} />
                </tr>
              </thead>
              <tbody>
                {(purchaseDocsQ.data.purchaseDocuments ?? [])
                  .slice()
                  .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber, "ru", { numeric: true }))
                  .map((d) => (
                    <tr key={d.id}>
                      <td style={thtdDense}>№ {d.documentNumber}</td>
                      <td style={thtdDense}>{d.docDate}</td>
                      <td style={thtdDense}>{d.lineCount}</td>
                      <td style={thtdDense}>
                        <button
                          type="button"
                          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                          disabled={deletePurchaseDocument.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Удалить накладную № ${d.documentNumber} и все связанные партии? Действие необратимо.`,
                              )
                            ) {
                              void deletePurchaseDocument.mutate(d.id);
                            }
                          }}
                        >
                          Удалить
                        </button>{" "}
                        <Link to={purchaseNakladnayaDocumentPath(d.id, "admin")} style={{ fontSize: "0.86rem" }}>
                          править
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </BirzhaDisclosure>

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Склад</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Погрузочные накладные</span>
          </span>
        }
      >
        {loadingManifestsQ.isError ? <ErrorAlert error={loadingManifestsQ.error} title="Погрузочные" /> : null}
        {loadingManifestsQ.isPending && (
          <LoadingBlock label="Список погрузочных…" minHeight={48} skeleton skeletonRows={3} />
        )}
        {loadingManifestsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>№</th>
                  <th style={thHeadDense}>Дата</th>
                  <th style={thHeadDense}>Склад</th>
                  <th style={thHeadDense}>Куда</th>
                  <th style={thHeadDense}>Рейс</th>
                  <th style={thHeadDense}>кг</th>
                  <th style={thHeadDense} />
                </tr>
              </thead>
              <tbody>
                {(loadingManifestsQ.data.loadingManifests ?? [])
                  .slice()
                  .sort((a, b) => a.manifestNumber.localeCompare(b.manifestNumber, "ru", { numeric: true }))
                  .map((m) => (
                    <tr key={m.id}>
                      <td style={thtdDense}>№ {m.manifestNumber}</td>
                      <td style={thtdDense}>{m.docDate}</td>
                      <td style={thtdDense}>{m.warehouseName}</td>
                      <td style={thtdDense}>{m.destinationName}</td>
                      <td style={thtdDense}>{m.tripId ? "привязан" : "—"}</td>
                      <td style={thtdDense}>{m.totalKg > 0 ? m.totalKg.toLocaleString("ru-RU") : "—"}</td>
                      <td style={thtdDense}>
                        <button
                          type="button"
                          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                          disabled={deleteLoadingManifest.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Удалить погрузочную накладную № ${m.manifestNumber}? Отгруженные в рейс удалить нельзя.`,
                              )
                            ) {
                              void deleteLoadingManifest.mutate(m.id);
                            }
                          }}
                        >
                          Удалить
                        </button>{" "}
                        <Link to={`${adminRoutes.loadingManifests}/${encodeURIComponent(m.id)}`} style={{ fontSize: "0.86rem" }}>
                          править
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </BirzhaDisclosure>

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Логистика</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Рейсы</span>
          </span>
        }
      >
        <p className="birzha-ui-sm" style={{ marginTop: 0 }}>
          Удаляется только пустой рейс (без отгрузки, продаж и недостач). Создание и закрытие — в разделе{" "}
          <Link to={adminRoutes.trips}>Рейсы</Link>.
        </p>
        {tripsQ.isError ? <ErrorAlert error={tripsQ.error} title="Рейсы" /> : null}
        {tripsQ.isPending && <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />}
        {tripsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>№</th>
                  <th style={thHeadDense}>Статус</th>
                  <th style={thHeadDense} />
                </tr>
              </thead>
              <tbody>
                {sortedTrips.map((t) => {
                  const busy = tripHasMovements(t);
                  return (
                    <tr key={t.id}>
                      <td style={thtdDense}>{t.tripNumber}</td>
                      <td style={thtdDense}>{formatTripListStatusLabel(t)}</td>
                      <td style={thtdDense}>
                        <button
                          type="button"
                          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                          disabled={deleteTrip.isPending}
                          title={busy ? "В рейсе есть движения — удаление недоступно" : undefined}
                          onClick={() => {
                            if (busy) {
                              setPageError(
                                "Рейс с отгрузкой или продажами удалить нельзя. Сначала уберите движения в «Операциях».",
                              );
                              return;
                            }
                            if (
                              window.confirm(
                                `Удалить рейс № ${t.tripNumber}? Только если по нему нет отгрузок и продаж.`,
                              )
                            ) {
                              void deleteTrip.mutate(t.id);
                            }
                          }}
                        >
                          Удалить
                        </button>
                        {" "}
                        <Link to={adminRoutes.trips} style={{ fontSize: "0.86rem" }}>
                          править
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </BirzhaDisclosure>
    </>
  );
}
