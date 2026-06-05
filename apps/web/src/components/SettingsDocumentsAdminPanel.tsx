import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { LoadingManifestSummary, PurchaseDocumentSummary, TripJson } from "../api/types.js";
import {
  apiDeleteOr403,
  deleteLoadingManifestById,
  deleteTripById,
  patchLoadingManifestHeader,
  patchPurchaseDocumentHeader,
  patchTripHeader,
} from "../api/fetch-api.js";
import {
  loadingManifestsPagedQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes } from "../routes.js";
import { buildTripDisplayNumber, formatTripListStatusLabel } from "../format/trip-label.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, dateFieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

const SETTINGS_MANIFEST_PAGE_SIZE = 50;

type SettingsDocumentsAdminPanelProps = {
  embedded?: boolean;
};

const compactField: CSSProperties = {
  ...dateFieldStyle,
  marginTop: 0,
  minHeight: "2rem",
  padding: "0.25rem 0.5rem",
  fontSize: "0.86rem",
  width: "100%",
  minWidth: 72,
};

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso?.trim()) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  const t = local.trim();
  if (!t) {
    return null;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Неверная дата отправления");
  }
  return d.toISOString();
}

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

type PurchaseDocRowProps = {
  doc: PurchaseDocumentSummary;
  saving: boolean;
  deleting: boolean;
  onSave: (id: string, documentNumber: string, docDate: string) => void;
  onDelete: (doc: PurchaseDocumentSummary) => void;
};

function PurchaseDocRow({ doc, saving, deleting, onSave, onDelete }: PurchaseDocRowProps) {
  const [documentNumber, setDocumentNumber] = useState(doc.documentNumber);
  const [docDate, setDocDate] = useState(doc.docDate);

  useEffect(() => {
    setDocumentNumber(doc.documentNumber);
    setDocDate(doc.docDate);
  }, [doc.documentNumber, doc.docDate]);

  const dirty = documentNumber.trim() !== doc.documentNumber || docDate !== doc.docDate;

  return (
    <tr>
      <td style={thtdDense}>
        <input
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
          style={compactField}
          aria-label={`Номер накладной ${doc.documentNumber}`}
        />
      </td>
      <td style={thtdDense}>
        <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={compactField} />
      </td>
      <td style={thtdDense}>{doc.lineCount}</td>
      <td style={thtdDense}>
        <button
          type="button"
          style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.55rem", marginRight: "0.35rem" }}
          disabled={!dirty || saving || deleting}
          onClick={() => onSave(doc.id, documentNumber.trim(), docDate)}
        >
          {saving ? "…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
          disabled={deleting || saving}
          onClick={() => onDelete(doc)}
        >
          Удалить
        </button>
      </td>
    </tr>
  );
}

type LoadingManifestRowProps = {
  manifest: LoadingManifestSummary;
  saving: boolean;
  deleting: boolean;
  onSave: (id: string, manifestNumber: string, docDate: string) => void;
  onDelete: (manifest: LoadingManifestSummary) => void;
};

function LoadingManifestRow({ manifest, saving, deleting, onSave, onDelete }: LoadingManifestRowProps) {
  const [manifestNumber, setManifestNumber] = useState(manifest.manifestNumber);
  const [docDate, setDocDate] = useState(manifest.docDate);

  useEffect(() => {
    setManifestNumber(manifest.manifestNumber);
    setDocDate(manifest.docDate);
  }, [manifest.manifestNumber, manifest.docDate]);

  const dirty = manifestNumber.trim() !== manifest.manifestNumber || docDate !== manifest.docDate;

  return (
    <tr>
      <td style={thtdDense}>
        <input value={manifestNumber} onChange={(e) => setManifestNumber(e.target.value)} style={compactField} />
      </td>
      <td style={thtdDense}>
        <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={compactField} />
      </td>
      <td style={thtdDense}>{manifest.warehouseName}</td>
      <td style={thtdDense}>{manifest.destinationName}</td>
      <td style={thtdDense}>{manifest.tripId ? "привязан" : "—"}</td>
      <td style={thtdDense}>{manifest.totalKg > 0 ? manifest.totalKg.toLocaleString("ru-RU") : "—"}</td>
      <td style={thtdDense}>
        <button
          type="button"
          style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.55rem", marginRight: "0.35rem" }}
          disabled={!dirty || saving || deleting}
          onClick={() => onSave(manifest.id, manifestNumber.trim(), docDate)}
        >
          {saving ? "…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
          disabled={deleting || saving}
          onClick={() => onDelete(manifest)}
        >
          Удалить
        </button>
      </td>
    </tr>
  );
}

type TripRowProps = {
  trip: TripJson;
  saving: boolean;
  deleting: boolean;
  onSave: (id: string, draft: { vehicleLabel: string; driverName: string; departedLocal: string }) => void;
  onDelete: (trip: TripJson, busy: boolean) => void;
};

function TripRow({ trip, saving, deleting, onSave, onDelete }: TripRowProps) {
  const [vehicleLabel, setVehicleLabel] = useState(trip.vehicleLabel ?? "");
  const [driverName, setDriverName] = useState(trip.driverName ?? "");
  const [departedLocal, setDepartedLocal] = useState(isoToDatetimeLocal(trip.departedAt));

  useEffect(() => {
    setVehicleLabel(trip.vehicleLabel ?? "");
    setDriverName(trip.driverName ?? "");
    setDepartedLocal(isoToDatetimeLocal(trip.departedAt));
  }, [trip.vehicleLabel, trip.driverName, trip.departedAt]);

  const dirty =
    vehicleLabel.trim() !== (trip.vehicleLabel ?? "").trim() ||
    driverName.trim() !== (trip.driverName ?? "").trim() ||
    departedLocal !== isoToDatetimeLocal(trip.departedAt);

  const busy = tripHasMovements(trip);

  return (
    <tr>
      <td style={thtdDense}>
        <input
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          style={compactField}
          placeholder="Водитель"
        />
      </td>
      <td style={thtdDense}>
        <input
          value={vehicleLabel}
          onChange={(e) => setVehicleLabel(e.target.value)}
          style={compactField}
          placeholder="Машина"
        />
      </td>
      <td style={thtdDense}>
        <input
          type="datetime-local"
          value={departedLocal}
          onChange={(e) => setDepartedLocal(e.target.value)}
          style={compactField}
        />
      </td>
      <td style={thtdDense}>{formatTripListStatusLabel(trip)}</td>
      <td style={thtdDense}>
        <button
          type="button"
          style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.55rem", marginRight: "0.35rem" }}
          disabled={!dirty || saving || deleting}
          onClick={() =>
            onSave(trip.id, {
              vehicleLabel: vehicleLabel.trim(),
              driverName: driverName.trim(),
              departedLocal,
            })
          }
        >
          {saving ? "…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
          disabled={deleting || saving}
          title={busy ? "В рейсе есть движения — удаление недоступно" : undefined}
          onClick={() => onDelete(trip, busy)}
        >
          Удалить
        </button>
      </td>
    </tr>
  );
}

/** Настройки → Накладные: правка шапок и удаление документов. */
export function SettingsDocumentsAdminPanel({ embedded = false }: SettingsDocumentsAdminPanelProps = {}) {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const purchaseEnabled = meta?.purchaseDocumentsApi === "enabled";
  const tripsEnabled = meta?.tripsApi === "enabled";

  const [manifestSettingsPage, setManifestSettingsPage] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingPurchaseId, setSavingPurchaseId] = useState<string | null>(null);
  const [savingManifestId, setSavingManifestId] = useState<string | null>(null);
  const [savingTripId, setSavingTripId] = useState<string | null>(null);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.purchaseDocuments });
    void queryClient.invalidateQueries({ queryKey: queryRoots.loadingManifest });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  }, [queryClient]);

  const purchaseDocsQ = useQuery({ ...purchaseDocumentsFullListQueryOptions(), enabled: purchaseEnabled });
  const loadingManifestsQ = useQuery({
    ...loadingManifestsPagedQueryOptions({
      limit: SETTINGS_MANIFEST_PAGE_SIZE,
      offset: manifestSettingsPage * SETTINGS_MANIFEST_PAGE_SIZE,
      scope: "all",
    }),
    enabled: purchaseEnabled,
  });
  const tripsQ = useQuery({ ...tripsPickerQueryOptions({ limit: 500 }), enabled: tripsEnabled });
  const manifestSettingsTotal = loadingManifestsQ.data?.listMeta?.totalCount ?? loadingManifestsQ.data?.loadingManifests.length ?? 0;
  const manifestSettingsPageCount = Math.max(
    1,
    Math.ceil(manifestSettingsTotal / SETTINGS_MANIFEST_PAGE_SIZE),
  );

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

  const handleSavePurchase = async (id: string, documentNumber: string, docDate: string) => {
    if (!documentNumber) {
      setPageError("Укажите номер накладной.");
      return;
    }
    setPageError(null);
    setSavingPurchaseId(id);
    try {
      const doc = purchaseDocsQ.data?.purchaseDocuments.find((d) => d.id === id);
      const body: { documentNumber?: string; docDate?: string } = {};
      if (doc && documentNumber !== doc.documentNumber) {
        body.documentNumber = documentNumber;
      }
      if (doc && docDate !== doc.docDate) {
        body.docDate = docDate;
      }
      await patchPurchaseDocumentHeader(id, body, "Недостаточно прав: правка накладных — только admin.");
      invalidateAll();
    } catch (e: unknown) {
      setPageError(humanizeErrorMessage(e));
    } finally {
      setSavingPurchaseId(null);
    }
  };

  const handleSaveManifest = async (id: string, manifestNumber: string, docDate: string) => {
    if (!manifestNumber) {
      setPageError("Укажите номер погрузочной накладной.");
      return;
    }
    setPageError(null);
    setSavingManifestId(id);
    try {
      const m = loadingManifestsQ.data?.loadingManifests.find((x) => x.id === id);
      const body: { manifestNumber?: string; docDate?: string } = {};
      if (m && manifestNumber !== m.manifestNumber) {
        body.manifestNumber = manifestNumber;
      }
      if (m && docDate !== m.docDate) {
        body.docDate = docDate;
      }
      await patchLoadingManifestHeader(id, body, "Недостаточно прав: правка погрузочных — только admin.");
      invalidateAll();
    } catch (e: unknown) {
      setPageError(humanizeErrorMessage(e));
    } finally {
      setSavingManifestId(null);
    }
  };

  const handleSaveTrip = async (
    id: string,
    draft: { vehicleLabel: string; driverName: string; departedLocal: string },
  ) => {
    if (!draft.driverName.trim()) {
      setPageError("Укажите водителя.");
      return;
    }
    if (!draft.vehicleLabel.trim()) {
      setPageError("Укажите номер машины.");
      return;
    }
    setPageError(null);
    setSavingTripId(id);
    try {
      const t = tripsQ.data?.trips.find((x) => x.id === id);
      const vl = draft.vehicleLabel.trim();
      const dr = draft.driverName.trim();
      const depIso = draft.departedLocal.trim() ? datetimeLocalToIso(draft.departedLocal) : null;
      const body: {
        tripNumber?: string;
        vehicleLabel?: string | null;
        driverName?: string | null;
        departedAt?: string | null;
      } = {};
      const displayNumber = buildTripDisplayNumber({
        driverName: dr,
        vehicleLabel: vl,
        departedAt: depIso,
      });
      if (t && displayNumber !== t.tripNumber) {
        body.tripNumber = displayNumber;
      }
      if (t && vl !== (t.vehicleLabel?.trim() || "")) {
        body.vehicleLabel = vl;
      }
      if (t && dr !== (t.driverName?.trim() || "")) {
        body.driverName = dr;
      }
      const origIso = t?.departedAt?.trim() ? t.departedAt : null;
      if (depIso !== origIso) {
        body.departedAt = depIso;
      }
      await patchTripHeader(id, body, "Недостаточно прав на правку рейса.");
      invalidateAll();
    } catch (e: unknown) {
      setPageError(humanizeErrorMessage(e));
    } finally {
      setSavingTripId(null);
    }
  };

  const sortedTrips = sortTripsByDepartedDesc(tripsQ.data?.trips ?? []);

  return (
    <div className="birzha-section-shell">
      {!embedded ? (
        <header className="birzha-home-hero birzha-settings-documents__hero birzha-section-hero">
          <div>
            <p className="birzha-home-hero__eyebrow">Администрирование</p>
            <h2 className="birzha-home-hero__title">Накладные и рейсы</h2>
          </div>
        </header>
      ) : null}

      <p className="birzha-ui-sm birzha-section-note">
        Измените поля прямо в таблице и нажмите «Сохранить». Строки накладных и состав партий здесь не редактируются.
      </p>

      {pageError ? <ErrorAlert message={pageError} title="Ошибка" /> : null}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Закупки</span>
            <span className="birzha-section-title-inline">Закупочные накладные</span>
          </span>
        }
      >
        {purchaseDocsQ.isError ? <ErrorAlert error={purchaseDocsQ.error} title="Закупочные" /> : null}
        {purchaseDocsQ.isPending && (
          <LoadingBlock label="Список накладных…" minHeight={48} skeleton skeletonRows={3} />
        )}
        {purchaseDocsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 640 }}>
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
                    <PurchaseDocRow
                      key={d.id}
                      doc={d}
                      saving={savingPurchaseId === d.id}
                      deleting={deletePurchaseDocument.isPending}
                      onSave={(id, num, date) => void handleSavePurchase(id, num, date)}
                      onDelete={(doc) => {
                        if (
                          window.confirm(
                            `Удалить накладную № ${doc.documentNumber} и все связанные партии? Действие необратимо.`,
                          )
                        ) {
                          void deletePurchaseDocument.mutate(doc.id);
                        }
                      }}
                    />
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
            <span className="birzha-section-title-inline">Погрузочные накладные</span>
          </span>
        }
      >
        {loadingManifestsQ.isError ? <ErrorAlert error={loadingManifestsQ.error} title="Погрузочные" /> : null}
        {loadingManifestsQ.isPending && (
          <LoadingBlock label="Список погрузочных…" minHeight={48} skeleton skeletonRows={3} />
        )}
        {loadingManifestsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 900 }}>
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
                {(loadingManifestsQ.data?.loadingManifests ?? [])
                  .slice()
                  .sort((a, b) => a.manifestNumber.localeCompare(b.manifestNumber, "ru", { numeric: true }))
                  .map((m) => (
                    <LoadingManifestRow
                      key={m.id}
                      manifest={m}
                      saving={savingManifestId === m.id}
                      deleting={deleteLoadingManifest.isPending}
                      onSave={(id, num, date) => void handleSaveManifest(id, num, date)}
                      onDelete={(manifest) => {
                        if (
                          window.confirm(
                            `Удалить погрузочную накладную № ${manifest.manifestNumber}? Отгруженные в рейс удалить нельзя.`,
                          )
                        ) {
                          void deleteLoadingManifest.mutate(manifest.id);
                        }
                      }}
                    />
                  ))}
              </tbody>
            </table>
            {manifestSettingsPageCount > 1 ? (
              <BirzhaPagination
                pageIndex={manifestSettingsPage}
                pageCount={manifestSettingsPageCount}
                itemLabel="погрузочных"
                onPageChange={setManifestSettingsPage}
              />
            ) : null}
          </div>
        )}
      </BirzhaDisclosure>

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Логистика</span>
            <span className="birzha-section-title-inline">Рейсы</span>
          </span>
        }
      >
        <p className="birzha-ui-sm" style={{ marginTop: 0 }}>
          Удаляется только пустой рейс. Создание и закрытие — в разделе{" "}
          <Link to={adminRoutes.trips}>Рейсы</Link>.
        </p>
        {tripsQ.isError ? <ErrorAlert error={tripsQ.error} title="Рейсы" /> : null}
        {tripsQ.isPending && <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />}
        {tripsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>Водитель</th>
                  <th style={thHeadDense}>Машина</th>
                  <th style={thHeadDense}>Отправление</th>
                  <th style={thHeadDense}>Статус</th>
                  <th style={thHeadDense} />
                </tr>
              </thead>
              <tbody>
                {sortedTrips.map((t) => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    saving={savingTripId === t.id}
                    deleting={deleteTrip.isPending}
                    onSave={(id, draft) => void handleSaveTrip(id, draft)}
                    onDelete={(trip, busy) => {
                      if (busy) {
                        setPageError(
                          "Рейс с отгрузкой или продажами удалить нельзя. Сначала уберите движения в «Операциях».",
                        );
                        return;
                      }
                      if (
                        window.confirm(
                          `Удалить рейс «${buildTripDisplayNumber(trip) === "Рейс" ? trip.tripNumber : buildTripDisplayNumber(trip)}»? Только если по нему нет отгрузок и продаж.`,
                        )
                      ) {
                        void deleteTrip.mutate(trip.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BirzhaDisclosure>
    </div>
  );
}
