import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiPostJsonOr403, closeTripById, deleteTripById } from "../api/fetch-api.js";
import {
  buildTripDisplayNumber,
  formatTripDepartedAtRu,
  formatTripListStatusLabel,
  suggestNextTripNumber,
  tripListFullySold,
} from "../format/trip-label.js";
import { filterTripsInWork } from "../format/archive.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { queryRoots, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, dateFieldStyle, fieldStyle } from "../ui/styles.js";
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
  const tripsApiEnabled = meta?.tripsApi === "enabled";

  const [newTripNumber, setNewTripNumber] = useState("");
  const [newTripVehicle, setNewTripVehicle] = useState("");
  const [newTripDriver, setNewTripDriver] = useState("");
  const [newTripDeparted, setNewTripDeparted] = useState("");
  const [tripError, setTripError] = useState<string | null>(null);

  const operationsPath = adminAwarePathForPath(pathname, adminRoutes.operations, ops.operations);

  const invalidateTrips = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.loadingManifest });
  }, [queryClient]);

  const tripsQ = useQuery({
    ...tripsFullListQueryOptions(),
    enabled: tripsApiEnabled,
  });

  const archivePath = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);
  const openTrips = useMemo(
    () => sortTripsByDepartedDesc(filterTripsInWork(tripsQ.data?.trips ?? [])),
    [tripsQ.data?.trips],
  );

  const suggestedTripNumber = useMemo(
    () => suggestNextTripNumber(tripsQ.data?.trips ?? []),
    [tripsQ.data?.trips],
  );

  useEffect(() => {
    if (newTripNumber === "" && suggestedTripNumber) {
      setNewTripNumber(suggestedTripNumber);
    }
  }, [newTripNumber, suggestedTripNumber]);

  const createTrip = useMutation({
    mutationFn: async () => {
      setTripError(null);
      const id = randomUuid();
      const num = newTripNumber.trim() || suggestedTripNumber;
      const dr = newTripDriver.trim();
      const vl = newTripVehicle.trim();
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
        },
        "Нет прав: создание рейса — роли admin, manager, logistics",
      );
    },
    onSuccess: () => {
      setNewTripVehicle("");
      setNewTripDriver("");
      setNewTripDeparted("");
      setNewTripNumber("");
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
                № рейса
                <input
                  value={newTripNumber}
                  onChange={(e) => setNewTripNumber(e.target.value)}
                  style={fieldStyle}
                  placeholder={suggestedTripNumber}
                  inputMode="numeric"
                  autoComplete="off"
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
              <button type="button" style={btnStyle} disabled={createTrip.isPending} onClick={() => void createTrip.mutate()}>
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
                    <th>Водитель</th>
                    <th>Машина</th>
                    <th>Отправление</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrips.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="birzha-text-muted">
                        Нет рейсов в работе
                      </td>
                    </tr>
                  ) : null}
                  {openTrips.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.tripNumber}</strong>
                      </td>
                      <td>{t.driverName ?? "—"}</td>
                      <td>{t.vehicleLabel ?? "—"}</td>
                      <td className="birzha-data-table__emph">{formatTripDepartedAtRu(t.departedAt)}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.75rem 0 0" }}>
            Закрытые рейсы — в разделе <Link to={archivePath}>«Архив»</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
