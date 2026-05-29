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
  loadingManifestsListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes } from "../routes.js";
import { formatTripListStatusLabel } from "../format/trip-label.js";
import { sortTripsByTripNumberNumericAsc } from "../format/trip-sort.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, dateFieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

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
  onSave: (
    id: string,
    draft: { tripNumber: string; vehicleLabel: string; driverName: string; departedLocal: string },
  ) => void;
  onDelete: (trip: TripJson, busy: boolean) => void;
};

function TripRow({ trip, saving, deleting, onSave, onDelete }: TripRowProps) {
  const [tripNumber, setTripNumber] = useState(trip.tripNumber);
  const [vehicleLabel, setVehicleLabel] = useState(trip.vehicleLabel ?? "");
  const [driverName, setDriverName] = useState(trip.driverName ?? "");
  const [departedLocal, setDepartedLocal] = useState(isoToDatetimeLocal(trip.departedAt));

  useEffect(() => {
    setTripNumber(trip.tripNumber);
    setVehicleLabel(trip.vehicleLabel ?? "");
    setDriverName(trip.driverName ?? "");
    setDepartedLocal(isoToDatetimeLocal(trip.departedAt));
  }, [trip.tripNumber, trip.vehicleLabel, trip.driverName, trip.departedAt]);

  const dirty =
    tripNumber.trim() !== trip.tripNumber ||
    vehicleLabel.trim() !== (trip.vehicleLabel ?? "").trim() ||
    driverName.trim() !== (trip.driverName ?? "").trim() ||
    departedLocal !== isoToDatetimeLocal(trip.departedAt);

  const busy = tripHasMovements(trip);

  return (
    <tr>
      <td style={thtdDense}>
        <input value={tripNumber} onChange={(e) => setTripNumber(e.target.value)} style={compactField} />
      </td>
      <td style={thtdDense}>
        <input
          value={vehicleLabel}
          onChange={(e) => setVehicleLabel(e.target.value)}
          style={compactField}
          placeholder="ТС"
        />
      </td>
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
              tripNumber: tripNumber.trim(),
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
    draft: { tripNumber: string; vehicleLabel: string; driverName: string; departedLocal: string },
  ) => {
    if (!draft.tripNumber) {
      setPageError("Укажите номер рейса.");
      return;
    }
    setPageError(null);
    setSavingTripId(id);
    try {
      const t = tripsQ.data?.trips.find((x) => x.id === id);
      const body: {
        tripNumber?: string;
        vehicleLabel?: string | null;
        driverName?: string | null;
        departedAt?: string | null;
      } = {};
      if (t && draft.tripNumber !== t.tripNumber) {
        body.tripNumber = draft.tripNumber;
      }
      const vl = draft.vehicleLabel.trim() || null;
      if (t && vl !== (t.vehicleLabel?.trim() || null)) {
        body.vehicleLabel = vl;
      }
      const dr = draft.driverName.trim() || null;
      if (t && dr !== (t.driverName?.trim() || null)) {
        body.driverName = dr;
      }
      const depIso = datetimeLocalToIso(draft.departedLocal);
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

      <p className="birzha-ui-sm" style={{ marginTop: 0 }}>
        Измените поля прямо в таблице и нажмите «Сохранить». Строки накладных и состав партий здесь не редактируются.
      </p>

      {pageError ? <ErrorAlert message={pageError} title="Ошибка" /> : null}

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
                {(loadingManifestsQ.data.loadingManifests ?? [])
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
          Удаляется только пустой рейс. Создание и закрытие — в разделе{" "}
          <Link to={adminRoutes.trips}>Рейсы</Link>.
        </p>
        {tripsQ.isError ? <ErrorAlert error={tripsQ.error} title="Рейсы" /> : null}
        {tripsQ.isPending && <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />}
        {tripsQ.isSuccess && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>№</th>
                  <th style={thHeadDense}>ТС</th>
                  <th style={thHeadDense}>Водитель</th>
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
                          `Удалить рейс № ${trip.tripNumber}? Только если по нему нет отгрузок и продаж.`,
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
    </>
  );
}
