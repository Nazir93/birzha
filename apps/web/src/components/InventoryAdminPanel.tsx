import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import {
  apiDelete,
  apiDeleteOr403,
  apiPostJson,
  apiPostJsonOr403,
  closeTripById,
  deleteTripById,
} from "../api/fetch-api.js";
import type {
  CreateProductGradeResponse,
  CreateWarehouseResponse,
} from "../api/types.js";
import { formatTripListStatusLabel, tripListShowsSoldOut } from "../format/trip-label.js";
import { sortTripsByTripNumberNumericAsc } from "../format/trip-sort.js";
import {
  batchesFullListQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  shipDestinationsFullListQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes, purchaseNakladnayaDocumentPath } from "../routes.js";
import { Link } from "react-router-dom";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";
import { BatchesByNakladnayaReference } from "./BatchesByNakladnayaReference.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

const TRIP_WRITE_ROLES = ["admin", "manager", "logistics"] as const;

function canTripWrite(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null): boolean {
  if (!user) {
    return false;
  }
  return TRIP_WRITE_ROLES.some((r) =>
    user.roles.some((g) => g.roleCode === r && g.scopeType === "global" && g.scopeId === ""),
  );
}

/**
 * Справочники «склад» и «калибр» — admin/manager. Закуп вводит накладные в /o, не создавая сущности здесь.
 */
export function InventoryAdminPanel() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";
  const showCloseTrip = canTripWrite(user);

  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseCode, setNewWarehouseCode] = useState("");
  const [warehouseFormError, setWarehouseFormError] = useState<string | null>(null);
  const [newGradeCode, setNewGradeCode] = useState("");
  const [newGradeDisplayName, setNewGradeDisplayName] = useState("");
  const [newGradeProductGroup, setNewGradeProductGroup] = useState("");
  const [newGradeSortOrder, setNewGradeSortOrder] = useState("");
  const [gradeFormError, setGradeFormError] = useState<string | null>(null);
  const [newDestCode, setNewDestCode] = useState("");
  const [newDestName, setNewDestName] = useState("");
  const [newDestOrder, setNewDestOrder] = useState("");
  const [destFormError, setDestFormError] = useState<string | null>(null);
  const [nakladError, setNakladError] = useState<string | null>(null);
  const [newTripId, setNewTripId] = useState("");
  const [newTripNumber, setNewTripNumber] = useState("");
  const [newTripVehicle, setNewTripVehicle] = useState("");
  const [newTripDriver, setNewTripDriver] = useState("");
  const [newTripDeparted, setNewTripDeparted] = useState(""); // datetime-local
  const [tripError, setTripError] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.warehouses });
    void queryClient.invalidateQueries({ queryKey: queryRoots.productGrades });
    void queryClient.invalidateQueries({ queryKey: queryRoots.purchaseDocuments });
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipDestinations });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  }, [queryClient]);

  const warehousesQ = useQuery({ ...warehousesFullListQueryOptions(), enabled });

  const shipDestEnabled = meta?.shipDestinationsApi === "enabled";
  const tripsApiEnabled = meta?.tripsApi === "enabled";

  const tripsQ = useQuery({
    ...tripsFullListQueryOptions(),
    enabled: enabled && tripsApiEnabled,
  });
  const purchaseDocsQ = useQuery({ ...purchaseDocumentsFullListQueryOptions(), enabled });
  const batchesNaklRefQ = useQuery({
    ...batchesFullListQueryOptions(),
    enabled,
  });
  const shipDestQ = useQuery({
    ...shipDestinationsFullListQueryOptions(),
    enabled: enabled && shipDestEnabled,
  });

  const deletePurchaseDocument = useMutation({
    mutationFn: async (documentId: string) => {
      setNakladError(null);
      await apiDeleteOr403(
        `/api/purchase-documents/${encodeURIComponent(documentId)}`,
        "Недостаточно прав: удаление накладных — только admin/manager (инвентарь).",
      );
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      setNakladError(e.message);
    },
  });

  const createShipDest = useMutation({
    mutationFn: async () => {
      setDestFormError(null);
      const code = newDestCode.trim();
      const displayName = newDestName.trim();
      if (!code || !displayName) {
        throw new Error("Код и название направления обязательны");
      }
      const body: { code: string; displayName: string; sortOrder?: number } = { code, displayName };
      const so = newDestOrder.trim();
      if (so) {
        const n = Number.parseInt(so, 10);
        if (!Number.isInteger(n) || n < 0 || n > 9999) {
          throw new Error("Порядок — целое 0…9999 или пусто");
        }
        body.sortOrder = n;
      }
      await apiPostJsonOr403("/api/ship-destinations", body, "Нет прав: только admin/manager");
    },
    onSuccess: () => {
      setNewDestCode("");
      setNewDestName("");
      setNewDestOrder("");
      invalidate();
    },
    onError: (e: Error) => {
      setDestFormError(e.message);
    },
  });

  const deleteShipDest = useMutation({
    mutationFn: async (code: string) => {
      setDestFormError(null);
      await apiDeleteOr403(
        `/api/ship-destinations/${encodeURIComponent(code)}`,
        "Нет прав: только admin/manager",
      );
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      setDestFormError(e.message);
    },
  });

  const gradesQ = useQuery({ ...productGradesFullListQueryOptions(), enabled });

  const createWarehouse = useMutation({
    mutationFn: async () => {
      setWarehouseFormError(null);
      const name = newWarehouseName.trim();
      if (!name) {
        throw new Error("Введите название склада");
      }
      const codeRaw = newWarehouseCode.trim();
      const body: { name: string; code?: string } = { name };
      if (codeRaw) {
        body.code = codeRaw;
      }
      return apiPostJson("/api/warehouses", body) as Promise<CreateWarehouseResponse>;
    },
    onSuccess: () => {
      setNewWarehouseName("");
      setNewWarehouseCode("");
      invalidate();
    },
    onError: (e: Error) => {
      setWarehouseFormError(e.message);
    },
  });

  const deleteWarehouse = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/api/warehouses/${encodeURIComponent(id)}`);
    },
    onSuccess: () => {
      invalidate();
    },
  });

  const createProductGrade = useMutation({
    mutationFn: async () => {
      setGradeFormError(null);
      const code = newGradeCode.trim();
      const displayName = newGradeDisplayName.trim();
      if (!code || !displayName) {
        throw new Error("Укажите код калибра и подпись (как на накладной)");
      }
      const body: { code: string; displayName: string; sortOrder?: number; productGroup?: string } = { code, displayName };
      const pg = newGradeProductGroup.trim();
      if (pg) {
        body.productGroup = pg;
      }
      const so = newGradeSortOrder.trim();
      if (so) {
        const n = Number(so.replace(",", "."));
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 9999) {
          throw new Error("Порядок сортировки — целое от 0 до 9999 или пусто");
        }
        body.sortOrder = n;
      }
      return apiPostJson("/api/product-grades", body) as Promise<CreateProductGradeResponse>;
    },
    onSuccess: () => {
      setNewGradeCode("");
      setNewGradeDisplayName("");
      setNewGradeProductGroup("");
      setNewGradeSortOrder("");
      invalidate();
    },
    onError: (e: Error) => {
      setGradeFormError(e.message);
    },
  });

  const deleteProductGrade = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/api/product-grades/${encodeURIComponent(id)}`);
    },
    onSuccess: () => {
      invalidate();
    },
  });

  const createTrip = useMutation({
    mutationFn: async () => {
      setTripError(null);
      const id = newTripId.trim();
      const tripNumber = newTripNumber.trim();
      if (!id || !tripNumber) {
        throw new Error("Id рейса (технический) и отображаемый номер обязательны");
      }
      const body: {
        id: string;
        tripNumber: string;
        vehicleLabel?: string | null;
        driverName?: string | null;
        departedAt?: string | null;
      } = { id, tripNumber };
      const vl = newTripVehicle.trim();
      if (vl) {
        body.vehicleLabel = vl;
      }
      const dr = newTripDriver.trim();
      if (dr) {
        body.driverName = dr;
      }
      if (newTripDeparted) {
        const t = new Date(newTripDeparted);
        if (Number.isNaN(t.getTime())) {
          throw new Error("Неверная дата/время отправления");
        }
        body.departedAt = t.toISOString();
      }
      await apiPostJsonOr403(
        "/api/trips",
        body,
        "Нет прав: создание рейса — роли admin, manager, logistics",
      );
    },
    onSuccess: () => {
      setNewTripId("");
      setNewTripNumber("");
      setNewTripVehicle("");
      setNewTripDriver("");
      setNewTripDeparted("");
      invalidate();
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
      invalidate();
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
      if (!tripListShowsSoldOut(t)) {
        const ok = window.confirm(
          "В рейсе по данным системы ещё есть остаток «в пути». Закрыть рейс всё равно? Обычно закрывают после полной продажи.",
        );
        if (!ok) {
          return;
        }
      }
      await closeTripById(tripId, "Нет прав: закрытие рейса — роли admin, manager, logistics");
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      setTripError(e.message);
    },
  });

  if (!enabled) {
    return (
      <section className="birzha-panel">
        <p className="birzha-callout-warning" role="status">
          Накладные и справочники временно недоступны. Проверьте сервер или обратитесь к администратору.
        </p>
      </section>
    );
  }

  return (
    <section className="birzha-home-premium birzha-inventory-admin" aria-labelledby="inv-adm-heading">
      <header className="birzha-home-hero birzha-inventory-admin__hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Справочники</p>
          <h2 id="inv-adm-heading" className="birzha-home-hero__title">
            Склады и калибры
          </h2>
        </div>
        <nav className="birzha-home-actions no-print" aria-label="Быстрые действия справочников">
          <Link to={adminRoutes.purchaseNakladnaya} className="birzha-home-action">
            <span>Ввод</span>
            <strong>Закупка товара</strong>
          </Link>
          <Link to={adminRoutes.operations} className="birzha-home-action">
            <span>Движение</span>
            <strong>Операции</strong>
          </Link>
        </nav>
      </header>

      <BirzhaDisclosure
        id="batches-nakl-ref"
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Партии</span>
            <span
              style={{
                fontSize: "0.95rem",
                margin: 0,
                fontWeight: 600,
                scrollMarginTop: "0.5rem",
              }}
            >
              Партии по накладным
            </span>
          </span>
        }
        hint="id партий и кг по документам"
      >
        <BatchesByNakladnayaReference
          batches={batchesNaklRefQ.data?.batches}
          isLoading={batchesNaklRefQ.isPending}
          sectionHeadingId="batches-nakl-ref-h"
          showBulkExpandControls
        />
        {batchesNaklRefQ.isError && <p style={errorText}>Партии не загрузились: {String(batchesNaklRefQ.error)}</p>}
      </BirzhaDisclosure>

      {tripsApiEnabled && (
        <BirzhaDisclosure
          defaultOpen
          title={
            <span className="birzha-disclosure__title-stack">
              <span className="birzha-section-heading__eyebrow">Логистика</span>
              <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Рейсы</span>
            </span>
          }
          hint="Создание и удаление пустых рейсов"
        >
          {tripError && <p style={errorText}>{tripError}</p>}
          <div className="birzha-inventory-logistics-form">
            <div className="birzha-inventory-logistics-form__field birzha-inventory-logistics-form__field--wide">
              <label className="birzha-field-label">Идентификатор</label>
              <div className="birzha-inventory-trip-id-row">
                <input
                  value={newTripId}
                  onChange={(e) => setNewTripId(e.target.value)}
                  style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
                  placeholder="можно оставить пустым"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="birzha-inventory-trip-id-row__gen"
                  style={{ ...btnStyle, fontSize: "0.82rem" }}
                  onClick={() => {
                    if (globalThis.crypto?.randomUUID) {
                      setNewTripId(globalThis.crypto.randomUUID());
                    }
                  }}
                >
                  Сгенерировать
                </button>
              </div>
            </div>
            <div className="birzha-inventory-logistics-form__field">
              <label className="birzha-field-label">№ рейса</label>
              <input
                value={newTripNumber}
                onChange={(e) => setNewTripNumber(e.target.value)}
                style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
                placeholder="Ф-12"
                autoComplete="off"
              />
            </div>
            <div className="birzha-inventory-logistics-form__field">
              <label className="birzha-field-label">ТС</label>
              <input
                value={newTripVehicle}
                onChange={(e) => setNewTripVehicle(e.target.value)}
                style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
                placeholder="опц."
                autoComplete="off"
              />
            </div>
            <div className="birzha-inventory-logistics-form__field">
              <label className="birzha-field-label">Водитель</label>
              <input
                value={newTripDriver}
                onChange={(e) => setNewTripDriver(e.target.value)}
                style={{ ...fieldStyle, width: "100%", maxWidth: "100%", minWidth: 0 }}
                placeholder="опц."
                autoComplete="off"
              />
            </div>
            <div className="birzha-inventory-logistics-form__field birzha-inventory-logistics-form__field--datetime">
              <label htmlFor="inv-adm-new-trip-departed" className="birzha-field-label">
                Отправление
              </label>
              <BirzhaDateTimeField
                id="inv-adm-new-trip-departed"
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
          {tripsQ.isError && <p style={errorText}>Рейсы: {String(tripsQ.error)}</p>}
          {tripsQ.isPending && (
            <LoadingBlock label="Список рейсов…" minHeight={48} skeleton skeletonRows={3} />
          )}
          {tripsQ.isSuccess && (
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.9rem" }}>
              <table style={{ ...tableStyle, minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thHeadDense}>№ (борт)</th>
                    <th style={thHeadDense}>Статус</th>
                    <th style={thHeadDense}>ТС</th>
                    <th style={thHeadDense}>Водитель</th>
                    <th style={thHeadDense}>id</th>
                    <th style={thHeadDense}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sortTripsByTripNumberNumericAsc(tripsQ.data.trips ?? []).map((t) => (
                      <tr key={t.id}>
                        <td style={thtdDense}>
                          <strong>№ {t.tripNumber}</strong>{" "}
                          <Link to={adminRoutes.operations} style={{ fontSize: "0.8rem" }}>
                            к операциям
                          </Link>
                        </td>
                        <td style={thtdDense}>
                          <span style={{ fontWeight: 600 }}>{formatTripListStatusLabel(t)}</span>
                          {tripListShowsSoldOut(t) ? (
                            <span
                              className="birzha-text-muted"
                              style={{ display: "block", fontSize: "0.75rem", marginTop: "0.15rem" }}
                            >
                              Остаток в пути 0
                            </span>
                          ) : null}
                        </td>
                        <td style={thtdDense}>{t.vehicleLabel ?? "—"}</td>
                        <td style={thtdDense}>{t.driverName ?? "—"}</td>
                        <td style={thtdDense}>
                          <code style={{ fontSize: "0.75rem" }} title={t.id}>
                            {t.id.slice(0, 8)}…
                          </code>
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
                                if (
                                  window.confirm(
                                    `Удалить пустой рейс «${t.tripNumber}»? Если в нём были отгрузки — ответит ошибкой.`,
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
          )}
        </BirzhaDisclosure>
      )}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Закупки</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Закупочные накладные (удаление)</span>
          </span>
        }
        hint="удаление документов"
      >
      {nakladError && <p style={errorText}>{nakladError}</p>}
      {purchaseDocsQ.isError && <p style={errorText}>Не загрузились накладные: {String(purchaseDocsQ.error)}</p>}
      {purchaseDocsQ.isPending && (
        <LoadingBlock label="Список накладных…" minHeight={48} skeleton skeletonRows={3} />
      )}
      {purchaseDocsQ.isSuccess && (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.75rem" }}>
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
                              `Удалить накладную № ${d.documentNumber} и все связанные партии/движения? Неотвратимо для учёта.`,
                            )
                          ) {
                            void deletePurchaseDocument.mutate(d.id);
                          }
                        }}
                      >
                        Удалить
                      </button>{" "}
                      <Link to={purchaseNakladnayaDocumentPath(d.id, "admin")} style={{ fontSize: "0.86rem" }}>
                        карточка
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      </BirzhaDisclosure>

      {shipDestEnabled && (
        <>
          <BirzhaDisclosure
            defaultOpen
            title={
              <span className="birzha-disclosure__title-stack">
                <span className="birzha-section-heading__eyebrow">Логистика</span>
                <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>
                  Направления / куда везти (для «Распределения»)
                </span>
              </span>
            }
            hint="куда везти в рейсе"
          >
          {destFormError && <p style={errorText}>{destFormError}</p>}
          {shipDestQ.isError && <p style={errorText}>Направления: {String(shipDestQ.error)}</p>}
          {shipDestQ.isPending && (
            <LoadingBlock label="Справочник направлений…" minHeight={48} skeleton skeletonRows={3} />
          )}
          <p className="birzha-callout-info" style={{ fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
            Код хранится в партии. «Удалить» — снятие с выбора (is_active = false), повтор с тем же кодом —
            обновит подпись и снова включит.
          </p>
          <div className="birzha-inventory-inline-tools">
            <input
              value={newDestCode}
              onChange={(e) => setNewDestCode(e.target.value)}
              style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
              placeholder="Код (лат.)"
              autoComplete="off"
              aria-label="Код направления"
            />
            <input
              value={newDestName}
              onChange={(e) => setNewDestName(e.target.value)}
              style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
              placeholder="Название (как в списке)"
              autoComplete="off"
              aria-label="Название направления"
            />
            <input
              value={newDestOrder}
              onChange={(e) => setNewDestOrder(e.target.value)}
              style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
              placeholder="Порядок"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Порядок сортировки"
            />
            <button
              type="button"
              className="birzha-inventory-inline-tools__submit"
              style={btnStyle}
              disabled={createShipDest.isPending}
              onClick={() => void createShipDest.mutate()}
            >
              {createShipDest.isPending ? "…" : "Добавить / обновить"}
            </button>
          </div>
          {shipDestQ.isSuccess && (
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.75rem" }}>
              <table style={{ ...tableStyle, minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={thHeadDense}>Код</th>
                    <th style={thHeadDense}>Название</th>
                    <th style={thHeadDense}>Порядок</th>
                    <th style={thHeadDense}>Активн.</th>
                    <th style={thHeadDense} />
                  </tr>
                </thead>
                <tbody>
                  {(shipDestQ.data.shipDestinations ?? [])
                    .slice()
                    .sort(
                      (a, b) =>
                        a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru"),
                    )
                    .map((r) => (
                      <tr key={r.code}>
                        <td style={thtdDense}>
                          <code style={{ fontSize: "0.82rem" }}>{r.code}</code>
                        </td>
                        <td style={thtdDense}>{r.displayName}</td>
                        <td style={thtdDense}>{r.sortOrder}</td>
                        <td style={thtdDense}>{r.isActive ? "да" : "нет"}</td>
                        <td style={thtdDense}>
                          {r.isActive ? (
                            <button
                              type="button"
                              style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
                              disabled={deleteShipDest.isPending}
                              onClick={() => {
                                if (window.confirm(`Снять направление «${r.displayName}» (код ${r.code})?`)) {
                                  void deleteShipDest.mutate(r.code);
                                }
                              }}
                            >
                              Снять
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          </BirzhaDisclosure>
        </>
      )}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Справочник</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Склады</span>
          </span>
        }
        hint="приёмка и удаление"
      >
      {warehousesQ.isError && (
        <p role="alert" style={errorText}>
          {warehousesQ.error instanceof Error ? warehousesQ.error.message : String(warehousesQ.error)}
        </p>
      )}
      {warehousesQ.isPending && (
        <LoadingBlock label="Загрузка складов…" minHeight={48} skeleton skeletonRows={3} />
      )}
      <div className="birzha-inventory-inline-tools birzha-inventory-inline-tools--catalog">
        <input
          value={newWarehouseName}
          onChange={(e) => setNewWarehouseName(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Название нового склада"
          autoComplete="off"
          aria-label="Название нового склада"
        />
        <input
          value={newWarehouseCode}
          onChange={(e) => setNewWarehouseCode(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Код (опц.)"
          autoComplete="off"
          aria-label="Код склада латиницей"
        />
        <button
          type="button"
          className="birzha-inventory-inline-tools__submit"
          style={btnStyle}
          disabled={createWarehouse.isPending}
          onClick={() => void createWarehouse.mutate()}
        >
          {createWarehouse.isPending ? "…" : "Добавить склад"}
        </button>
      </div>
      {warehouseFormError && <p style={errorText}>{warehouseFormError}</p>}
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ ...tableStyle, minWidth: 420 }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Название</th>
              <th style={thHeadDense}>Код</th>
              <th style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {(warehousesQ.data?.warehouses ?? []).map((w) => (
              <tr key={w.id}>
                <td style={thtdDense}>{w.name}</td>
                <td style={thtdDense}>
                  <code style={{ fontSize: "0.82rem" }}>{w.code}</code>
                </td>
                <td style={thtdDense}>
                  <button
                    type="button"
                    className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                    disabled={deleteWarehouse.isPending}
                    onClick={() => {
                      if (window.confirm(`Удалить склад «${w.name}»?`)) {
                        void deleteWarehouse.mutate(w.id);
                      }
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </BirzhaDisclosure>

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Справочник</span>
            <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Калибры (сорта)</span>
          </span>
        }
        hint="калибры и группы"
      >
      {gradesQ.isError && (
        <p role="alert" style={errorText}>
          {gradesQ.error instanceof Error ? gradesQ.error.message : String(gradesQ.error)}
        </p>
      )}
      {gradesQ.isPending && (
        <LoadingBlock label="Загрузка калибров…" minHeight={48} skeleton skeletonRows={3} />
      )}
      <div className="birzha-inventory-inline-tools birzha-inventory-inline-tools--grades">
        <input
          value={newGradeProductGroup}
          onChange={(e) => setNewGradeProductGroup(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Группа (опц.)"
          autoComplete="off"
          aria-label="Группа товара"
        />
        <input
          value={newGradeCode}
          onChange={(e) => setNewGradeCode(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Код"
          autoComplete="off"
          aria-label="Код калибра"
        />
        <input
          value={newGradeDisplayName}
          onChange={(e) => setNewGradeDisplayName(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Подпись"
          autoComplete="off"
          aria-label="Подпись калибра"
        />
        <input
          value={newGradeSortOrder}
          onChange={(e) => setNewGradeSortOrder(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Порядок"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Порядок сортировки"
        />
        <button
          type="button"
          className="birzha-inventory-inline-tools__submit"
          style={btnStyle}
          disabled={createProductGrade.isPending}
          onClick={() => void createProductGrade.mutate()}
        >
          {createProductGrade.isPending ? "…" : "Добавить калибр"}
        </button>
      </div>
      {gradeFormError && <p style={errorText}>{gradeFormError}</p>}
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ ...tableStyle, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Код</th>
              <th style={thHeadDense}>Название</th>
              <th style={thHeadDense}>Группа</th>
              <th style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {(gradesQ.data?.productGrades ?? [])
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru"))
              .map((g) => (
                <tr key={g.id}>
                  <td style={thtdDense}>
                    <code style={{ fontSize: "0.82rem" }}>{g.code}</code>
                  </td>
                  <td style={thtdDense}>{g.displayName}</td>
                  <td style={thtdDense}>{g.productGroup ?? "—"}</td>
                  <td style={thtdDense}>
                    <button
                      type="button"
                      className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                      disabled={deleteProductGrade.isPending}
                      onClick={() => {
                        if (window.confirm(`Удалить калибр «${g.code}»?`)) {
                          void deleteProductGrade.mutate(g.id);
                        }
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      </BirzhaDisclosure>
    </section>
  );
}
