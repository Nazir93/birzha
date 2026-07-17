import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiPostJsonOr403, closeTripById, deleteTripById } from "../api/fetch-api.js";
import type { LoadingManifestSummary } from "../api/types.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import {
  buildTripDisplayNumber,
  formatTripDepartedAtRu,
  formatTripListStatusLabel,
  suggestNextTripNumber,
  tripListFullySold,
} from "../format/trip-label.js";
import {
  queryRoots,
  invalidateStockQueries,
  loadingManifestDetailQueryOptions,
  loadingManifestsPagedQueryOptions,
  shipDestinationsFullListQueryOptions,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { loadingManifestTripDetachLockMessage } from "../format/loading-manifest-trip-detach-lock.js";
import type { LoadingManifestTripDetachLockCode } from "../format/loading-manifest-trip-detach-lock.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip, canShipLoadingManifest } from "../auth/role-panels.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { WORK_LIST_PAGE_SIZE, clampListPageIndex, listPageCount } from "../format/list-page-sizes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, dateFieldStyle, fieldStyle, selectFieldStyle } from "../ui/styles.js";
import { randomUuid } from "../lib/random-uuid.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

/**
 * Создание / закрытие / удаление рейсов — вынесено из «Складов и калибров» в отдельный раздел меню.
 */
export function AdminTripsLogisticsPanel() {
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const canWriteTrips = canCreateTrip(user);
  const canDetachManifest = canShipLoadingManifest(user);
  const tripsApiEnabled = meta?.tripsApi === "enabled";

  const [newTripNumber, setNewTripNumber] = useState("");
  const [newTripDestinationCode, setNewTripDestinationCode] = useState("");
  const [newTripVehicle, setNewTripVehicle] = useState("");
  const [newTripDriver, setNewTripDriver] = useState("");
  const [newTripDeparted, setNewTripDeparted] = useState("");
  const [tripError, setTripError] = useState<string | null>(null);
  const [detachingManifestId, setDetachingManifestId] = useState<string | null>(null);
  const [tripsPage, setTripsPage] = useState(0);

  const operationsPath = adminAwarePathForPath(pathname, adminRoutes.operations, ops.operations);
  const distributionPath = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);

  const invalidateTrips = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    invalidateStockQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: queryRoots.loadingManifest });
  }, [queryClient]);

  const tripsPageOffset = tripsPage * WORK_LIST_PAGE_SIZE;
  const tripsQ = useQuery({
    ...tripsPickerQueryOptions({
      limit: WORK_LIST_PAGE_SIZE,
      offset: tripsPageOffset,
      status: "open",
      order: "departedAtDesc",
    }),
    enabled: tripsApiEnabled,
  });

  const tripsSuggestQ = useQuery({
    ...tripsPickerQueryOptions({ limit: 500, offset: 0, order: "tripNumber" }),
    enabled: tripsApiEnabled && canWriteTrips,
  });

  const destinationsQ = useQuery({
    ...shipDestinationsFullListQueryOptions(),
    enabled: tripsApiEnabled,
  });

  const destinationOptions = useMemo(() => {
    const list = destinationsQ.data?.shipDestinations ?? [];
    return [
      { value: "", label: "— выберите город —" },
      ...list.map((d) => ({ value: d.code, label: d.displayName || d.code })),
    ];
  }, [destinationsQ.data?.shipDestinations]);

  const destinationLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of destinationsQ.data?.shipDestinations ?? []) {
      map.set(d.code, d.displayName || d.code);
    }
    return map;
  }, [destinationsQ.data?.shipDestinations]);

  const openTrips = useMemo(() => tripsQ.data?.trips ?? [], [tripsQ.data?.trips]);
  const tripsTotalCount = tripsQ.data?.listMeta?.totalCount ?? openTrips.length;
  const tripsPageCount = listPageCount(tripsTotalCount, WORK_LIST_PAGE_SIZE);

  useEffect(() => {
    setTripsPage((p) => clampListPageIndex(p, tripsTotalCount, WORK_LIST_PAGE_SIZE));
  }, [tripsTotalCount]);

  const tripIdsOnPage = useMemo(() => openTrips.map((t) => t.id), [openTrips]);

  const manifestsByTripQueries = useQueries({
    queries: tripIdsOnPage.map((tripId) => ({
      ...loadingManifestsPagedQueryOptions({ limit: 50, offset: 0, scope: "active", tripId }),
      enabled: tripsApiEnabled && tripId.length > 0,
    })),
  });

  const manifestsByTripId = useMemo(() => {
    const map = new Map<string, LoadingManifestSummary[]>();
    tripIdsOnPage.forEach((tripId, index) => {
      const rows = manifestsByTripQueries[index]?.data?.loadingManifests ?? [];
      if (rows.length > 0) {
        map.set(
          tripId,
          rows.slice().sort((a, b) => a.manifestNumber.localeCompare(b.manifestNumber, "ru")),
        );
      }
    });
    return map;
  }, [manifestsByTripQueries, tripIdsOnPage]);

  const linkedManifestIds = useMemo(
    () => [...manifestsByTripId.values()].flat().map((m) => m.id),
    [manifestsByTripId],
  );

  const linkedManifestDetails = useQueries({
    queries: linkedManifestIds.map((id) => loadingManifestDetailQueryOptions(id)),
  });

  const detachLockByManifestId = useMemo(() => {
    const map = new Map<string, { locked: boolean; reason?: LoadingManifestTripDetachLockCode }>();
    linkedManifestIds.forEach((id, index) => {
      const row = linkedManifestDetails[index];
      const manifest = row?.data?.manifest;
      if (!manifest) {
        return;
      }
      map.set(id, {
        locked: manifest.tripDetachLocked !== false,
        reason: manifest.tripDetachLockedReason ?? undefined,
      });
    });
    return map;
  }, [linkedManifestDetails, linkedManifestIds]);

  const archivePath = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);

  const tripsForSuggest = tripsSuggestQ.data?.trips ?? [];

  const suggestedTripNumber = useMemo(() => {
    if (!newTripDestinationCode.trim()) {
      return "";
    }
    return suggestNextTripNumber(tripsForSuggest, newTripDestinationCode);
  }, [tripsForSuggest, newTripDestinationCode]);

  useEffect(() => {
    if (!newTripDestinationCode.trim()) {
      setNewTripNumber("");
      return;
    }
    if (suggestedTripNumber) {
      setNewTripNumber(suggestedTripNumber);
    }
  }, [newTripDestinationCode, suggestedTripNumber]);

  const createTrip = useMutation({
    mutationFn: async () => {
      setTripError(null);
      const id = randomUuid();
      const dest = newTripDestinationCode.trim();
      const num = newTripNumber.trim() || suggestedTripNumber;
      const dr = newTripDriver.trim();
      const vl = newTripVehicle.trim();
      if (!dest) {
        throw new Error("Укажите город рейса");
      }
      if (!num) {
        throw new Error("Укажите № рейса");
      }
      if (!dr) {
        throw new Error("Укажите водителя");
      }
      if (!vl) {
        throw new Error("Укажите номер машины");
      }
      if (!newTripDeparted) {
        throw new Error("Укажите дату отправления");
      }
      const t = new Date(newTripDeparted);
      if (Number.isNaN(t.getTime())) {
        throw new Error("Неверная дата/время отправления");
      }
      const departedAt = t.toISOString();
      await apiPostJsonOr403(
        "/api/trips",
        {
          id,
          tripNumber: num,
          vehicleLabel: vl,
          driverName: dr,
          departedAt,
          destinationCode: dest,
        },
        "Нет прав: создание рейса — роли admin, manager, logistics",
      );
    },
    onSuccess: () => {
      setNewTripVehicle("");
      setNewTripDriver("");
      setNewTripDeparted("");
      setNewTripNumber("");
      setNewTripDestinationCode("");
      invalidateTrips();
    },
    onError: (e: Error) => {
      setTripError(e.message);
    },
  });

  const deleteTrip = useMutation({
    mutationFn: async (tripId: string) => {
      setTripError(null);
      await deleteTripById(tripId, "Нет прав на удаление рейса");
    },
    onSuccess: () => {
      invalidateTrips();
    },
    onError: (e: Error) => {
      setTripError(e.message);
    },
  });

  const closeTrip = useMutation({
    mutationFn: async (tripId: string) => {
      setTripError(null);
      const t = (tripsQ.data?.trips ?? []).find((x) => x.id === tripId);
      if (!t) {
        throw new Error("Рейс не найден");
      }
      if (!tripListFullySold(t)) {
        const ok = window.confirm(
          "По данным системы ещё есть остаток погруженного (в машине). Закрыть рейс всё равно? Обычно закрывают после полной продажи.",
        );
        if (!ok) {
          return;
        }
      }
      await closeTripById(tripId, "Нет прав: закрытие рейса — роли admin, manager, logistics");
    },
    onSuccess: () => {
      invalidateTrips();
    },
    onError: (e: Error) => {
      setTripError(e.message);
    },
  });

  const detachManifest = useMutation({
    mutationFn: async (manifestId: string) => {
      setTripError(null);
      setDetachingManifestId(manifestId);
      await apiPostJsonOr403(
        `/api/loading-manifests/${encodeURIComponent(manifestId)}/detach-trip`,
        {},
        "Нет прав: отвязка погрузочной накладной — роли admin, manager, warehouse, logistics",
      );
    },
    onSuccess: () => {
      invalidateTrips();
    },
    onError: (e: Error) => {
      setTripError(e.message);
    },
    onSettled: () => {
      setDetachingManifestId(null);
    },
  });

  const disclosureTitle = (
    <div className="birzha-section-heading">
      <div>
        <p className="birzha-section-heading__eyebrow">Логистика</p>
        <h3 id="admin-trips-log-h" className="birzha-section-title birzha-section-title--sm">
          Рейсы
        </h3>
      </div>
    </div>
  );

  if (!tripsApiEnabled) {
    return (
      <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="admin-trips-log-h" role="region" aria-label="Рейсы">
        <BirzhaDisclosure defaultOpen className="birzha-clean-ops-disclosure" title={disclosureTitle}>
          <p className="birzha-callout-warning" role="status">
            API рейсов на сервере выключен — раздел недоступен.
          </p>
        </BirzhaDisclosure>
      </section>
    );
  }

  return (
    <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="admin-trips-log-h" role="region" aria-label="Рейсы">
      <BirzhaDisclosure defaultOpen className="birzha-clean-ops-disclosure" title={disclosureTitle}>
        {tripError ? <ErrorAlert message={tripError} title="Рейс" /> : null}
        {canWriteTrips ? (
          <>
            <div className="birzha-clean-ops-meta-grid">
              <label className="birzha-form-label">
                Город *
                <BirzhaSelect
                  value={newTripDestinationCode}
                  onChange={setNewTripDestinationCode}
                  className="birzha-clean-ops-field"
                  style={selectFieldStyle}
                  placeholder="— выберите город —"
                  options={destinationOptions}
                  disabled={destinationsQ.isPending}
                />
              </label>
              <label className="birzha-form-label">
                № рейса (по городу)
                <input
                  value={newTripNumber}
                  onChange={(e) => setNewTripNumber(e.target.value)}
                  style={fieldStyle}
                  placeholder={suggestedTripNumber || "сначала город"}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={!newTripDestinationCode.trim()}
                />
              </label>
              <label className="birzha-form-label">
                Водитель
                <input
                  value={newTripDriver}
                  onChange={(e) => setNewTripDriver(e.target.value)}
                  style={fieldStyle}
                  placeholder="Фамилия"
                  autoComplete="off"
                />
              </label>
              <label className="birzha-form-label">
                Номер машины
                <input
                  value={newTripVehicle}
                  onChange={(e) => setNewTripVehicle(e.target.value)}
                  style={fieldStyle}
                  placeholder="А123ВС 77"
                  autoComplete="off"
                />
              </label>
              <label className="birzha-form-label" htmlFor="trips-log-new-departed">
                Дата отправления
                <BirzhaDateTimeField
                  id="trips-log-new-departed"
                  value={newTripDeparted}
                  onChange={setNewTripDeparted}
                  style={dateFieldStyle}
                  className="birzha-input-date"
                  emptyLabel="—"
                />
              </label>
            </div>
            <p className="birzha-clean-ops-form-actions">
              <button type="button" className={btnClassSpaced} disabled={createTrip.isPending} onClick={() => void createTrip.mutate()}>
                {createTrip.isPending ? "…" : "Создать рейс"}
              </button>
            </p>
          </>
        ) : (
          <p className="birzha-callout-info birzha-ui-sm" role="status" style={{ margin: 0 }}>
            Создание и закрытие рейсов — у логиста или администратора. Здесь можно просмотреть открытые рейсы.
          </p>
        )}
      </BirzhaDisclosure>

      {tripsQ.isError ? <ErrorAlert error={tripsQ.error} title="Список рейсов" /> : null}
      {tripsQ.isPending && <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />}
      {tripsQ.isSuccess && (
        <div className="birzha-clean-ops-list">
          <h4 className="birzha-clean-ops-list__title">В работе ({openTrips.length})</h4>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
            <table className="birzha-data-table birzha-data-table--compact">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Город</th>
                    <th>Водитель</th>
                    <th>Машина</th>
                    <th>Отправление</th>
                    <th>Погрузочные накладные</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrips.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="birzha-text-muted">
                        Нет рейсов в работе
                      </td>
                    </tr>
                  ) : null}
                  {openTrips.map((t) => {
                    const linkedManifests = manifestsByTripId.get(t.id) ?? [];
                    const cityCode = t.destinationCode?.trim() || linkedManifests[0]?.destinationCode?.trim() || "";
                    const cityLabel =
                      (cityCode && destinationLabelByCode.get(cityCode)) ||
                      linkedManifests[0]?.destinationName ||
                      "—";
                    return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.tripNumber}</strong>
                      </td>
                      <td>{cityLabel}</td>
                      <td>{t.driverName ?? "—"}</td>
                      <td>{t.vehicleLabel ?? "—"}</td>
                      <td className="birzha-data-table__emph">{formatTripDepartedAtRu(t.departedAt)}</td>
                      <td>
                        {linkedManifests.length === 0 ? (
                          <span className="birzha-text-muted birzha-ui-sm">—</span>
                        ) : (
                          <ul className="birzha-trip-manifest-list">
                            {linkedManifests.map((m) => (
                              <li key={m.id} className="birzha-trip-manifest-list__item">
                                <Link to={`${distributionPath}/${m.id}`} className="birzha-ui-sm">
                                  <strong>
                                    {t.tripNumber} · {m.destinationName} · {formatPurchaseDocDateRu(m.docDate)}
                                  </strong>
                                </Link>
                                <span className="birzha-text-muted birzha-ui-sm">
                                  {" "}
                                  · {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} кг
                                </span>
                                {canDetachManifest ? (
                                  detachLockByManifestId.get(m.id)?.locked === false ? (
                                    <button
                                      type="button"
                                      className="birzha-clean-ops-row-action birzha-ui-sm"
                                      disabled={detachingManifestId === m.id}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            `Отвязать погрузочную «${m.manifestNumber}» от рейса ${t.tripNumber}? Масса вернётся на склад, если ещё не было продаж.`,
                                          )
                                        ) {
                                          void detachManifest.mutate(m.id);
                                        }
                                      }}
                                    >
                                      {detachingManifestId === m.id ? "…" : "Открепить"}
                                    </button>
                                  ) : detachLockByManifestId.get(m.id)?.reason ? (
                                    <span
                                      className="birzha-text-muted birzha-ui-sm"
                                      title={loadingManifestTripDetachLockMessage(
                                        detachLockByManifestId.get(m.id)!.reason!,
                                      )}
                                    >
                                      отвязка недоступна
                                    </span>
                                  ) : linkedManifestDetails.some((q) => q.isPending) ? (
                                    <span className="birzha-text-muted birzha-ui-sm">…</span>
                                  ) : null
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
                        {tripListFullySold(t) ? (
                          <span
                            className="birzha-text-muted birzha-ui-sm"
                            style={{ display: "block", marginTop: "0.15rem" }}
                          >
                            Остаток погруженного 0
                          </span>
                        ) : null}
                        <Link to={operationsPath} className="birzha-ui-sm" style={{ display: "block", marginTop: "0.2rem" }}>
                          к операциям
                        </Link>
                      </td>
                      <td>
                        {canWriteTrips ? (
                          <div className="birzha-clean-ops-row-actions">
                            {t.status === "open" ? (
                              <button
                                type="button"
                                className="birzha-clean-ops-row-action"
                                disabled={closeTrip.isPending}
                                onClick={() => void closeTrip.mutate(t.id)}
                              >
                                {closeTrip.isPending ? "…" : "Закрыть рейс"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="birzha-clean-ops-row-action birzha-clean-ops-row-action--danger"
                              disabled={deleteTrip.isPending}
                              onClick={() => {
                                const caption = t.tripNumber || buildTripDisplayNumber(t);
                                if (
                                  window.confirm(
                                    `Удалить рейс «${caption}»? Если в нём были отгрузки — ответит ошибкой.`,
                                  )
                                ) {
                                  void deleteTrip.mutate(t.id);
                                }
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        ) : (
                          <span className="birzha-text-muted birzha-ui-sm">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          <BirzhaPagination
            pageIndex={tripsPage}
            pageCount={tripsPageCount}
            itemLabel="рейсов"
            onPageChange={setTripsPage}
          />
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.75rem 0 0" }}>
            Закрытые рейсы — в разделе <Link to={archivePath}>«Архив»</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
