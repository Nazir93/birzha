import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiPostJsonOr403, closeTripById, deleteTripById } from "../api/fetch-api.js";
import { formatTripDepartedAtRu, formatTripListStatusLabel, tripListFullySold, buildTripDisplayNumber } from "../format/trip-label.js";
import { filterTripsInWork } from "../format/archive.js";
import { sortTripsByDepartedDesc } from "../format/trip-sort.js";
import { queryRoots, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateTrip } from "../auth/role-panels.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";
import { randomUuid } from "../lib/random-uuid.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

/**
 * Создание / закрытие / удаление рейсов — вынесено из «Складов и калибров» в отдельный раздел меню.
 */
export function AdminTripsLogisticsPanel() {
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const showCloseTrip = canCreateTrip(user);
  const tripsApiEnabled = meta?.tripsApi === "enabled";

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

  const createTrip = useMutation({
    mutationFn: async () => {
      setTripError(null);
      const id = randomUuid();
      const dr = newTripDriver.trim();
      const vl = newTripVehicle.trim();
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
      const tripNumber = buildTripDisplayNumber({
        driverName: dr,
        vehicleLabel: vl,
        departedAt,
      });
      await apiPostJsonOr403(
        "/api/trips",
        {
          id,
          tripNumber,
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

  if (!tripsApiEnabled) {
    return (
      <section className="birzha-card" aria-labelledby="admin-trips-log-h">
        <h2 id="admin-trips-log-h" style={{ margin: "0 0 0.65rem", fontSize: "1.08rem" }}>
          Рейсы
        </h2>
        <p className="birzha-callout-warning" role="status">
          API рейсов на сервере выключен — раздел недоступен.
        </p>
      </section>
    );
  }

  return (
    <section className="birzha-card birzha-home-premium birzha-inventory-admin" aria-labelledby="admin-trips-log-h">
      <h2 id="admin-trips-log-h" style={{ margin: "0 0 0.75rem", fontSize: "1.08rem" }}>
        Рейсы
      </h2>

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Логистика</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Рейсы</span>
          </span>
        }
      >
        {tripError ? <ErrorAlert message={tripError} title="Рейс" /> : null}
        <div className="birzha-inventory-logistics-form">
          <div className="birzha-inventory-logistics-form__field">
            <label className="birzha-field-label">Водитель</label>
            <input
              value={newTripDriver}
              onChange={(e) => setNewTripDriver(e.target.value)}
              style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
              placeholder="Фамилия"
              autoComplete="off"
            />
          </div>
          <div className="birzha-inventory-logistics-form__field">
            <label className="birzha-field-label">Номер машины</label>
            <input
              value={newTripVehicle}
              onChange={(e) => setNewTripVehicle(e.target.value)}
              style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
              placeholder="А123ВС 77"
              autoComplete="off"
            />
          </div>
          <div className="birzha-inventory-logistics-form__field birzha-inventory-logistics-form__field--datetime">
            <label htmlFor="trips-log-new-departed" className="birzha-field-label">
              Дата отправления
            </label>
            <BirzhaDateTimeField
              id="trips-log-new-departed"
              value={newTripDeparted}
              onChange={setNewTripDeparted}
              style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0, marginTop: 0.35 }}
              className="birzha-input-date"
              emptyLabel="—"
            />
          </div>
          <div className="birzha-inventory-logistics-form__field birzha-inventory-logistics-form__field--submit">
            <button
              type="button"
              className="birzha-inventory-logistics-form__submit-btn"
              style={btnStyle}
              disabled={createTrip.isPending}
              onClick={() => void createTrip.mutate()}
            >
              {createTrip.isPending ? "…" : "Создать рейс"}
            </button>
          </div>
        </div>
        {tripsQ.isError ? <ErrorAlert error={tripsQ.error} title="Список рейсов" /> : null}
        {tripsQ.isPending && <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />}
        {tripsQ.isSuccess && (
          <>
          <p className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.9rem" }}>
            В работе ({openTrips.length})
          </p>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.9rem" }}>
            <table style={{ ...tableStyle, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>Водитель</th>
                  <th style={thHeadDense}>Машина</th>
                  <th style={thHeadDense}>Отправление</th>
                  <th style={thHeadDense}>Статус</th>
                  <th style={thHeadDense}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {openTrips.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={thtdDense} className="birzha-text-muted">
                      Нет рейсов в работе
                    </td>
                  </tr>
                ) : null}
                {openTrips.map((t) => (
                  <tr key={t.id}>
                    <td style={thtdDense}>{t.driverName ?? "—"}</td>
                    <td style={thtdDense}>{t.vehicleLabel ?? "—"}</td>
                    <td style={thtdDense}>{formatTripDepartedAtRu(t.departedAt)}</td>
                    <td style={thtdDense}>
                      <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
                      {tripListFullySold(t) ? (
                        <span
                          className="birzha-text-muted"
                          style={{ display: "block", fontSize: "0.75rem", marginTop: "0.15rem" }}
                        >
                          Остаток погруженного 0
                        </span>
                      ) : null}
                      <Link to={operationsPath} style={{ display: "block", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                        к операциям
                      </Link>
                    </td>
                    <td style={thtdDense}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-start" }}>
                        {showCloseTrip && t.status === "open" ? (
                          <button
                            type="button"
                            style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
                            disabled={closeTrip.isPending}
                            onClick={() => void closeTrip.mutate(t.id)}
                          >
                            {closeTrip.isPending ? "…" : "Закрыть рейс"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                          disabled={deleteTrip.isPending}
                          onClick={() => {
                            const caption = buildTripDisplayNumber(t);
                            if (
                              window.confirm(
                                `Удалить рейс «${caption === "Рейс" ? t.tripNumber : caption}»? Если в нём были отгрузки — ответит ошибкой.`,
                              )
                            ) {
                              void deleteTrip.mutate(t.id);
                            }
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.75rem 0 0" }}>
            Закрытые рейсы — в разделе <Link to={archivePath}>«Архив»</Link>.
          </p>
          </>
        )}
      </BirzhaDisclosure>
    </section>
  );
}
