import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { apiFetch } from "../api/fetch-api.js";
import type {
  BatchesListResponse,
  CreateProductGradeResponse,
  CreateWarehouseResponse,
  ProductGradesListResponse,
  PurchaseDocumentsListResponse,
  ShipDestinationsListResponse,
  TripsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { ops, prefix } from "../routes.js";
import { Link } from "react-router-dom";
import { btnStyle, errorText, fieldStyle, muted, thHeadDense, thtdDense } from "../ui/styles.js";
import { BatchesByNakladnayaReference } from "./BatchesByNakladnayaReference.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

/**
 * Справочники «склад» и «калибр» — admin/manager. Закуп вводит накладные в /o, не создавая сущности здесь.
 */
export function InventoryAdminPanel() {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";

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
    void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    void queryClient.invalidateQueries({ queryKey: ["product-grades"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-documents"] });
    void queryClient.invalidateQueries({ queryKey: ["ship-destinations"] });
    void queryClient.invalidateQueries({ queryKey: ["trips"] });
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
  }, [queryClient]);

  const warehousesQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await apiFetch("/api/warehouses");
      if (!res.ok) {
        throw new Error(`warehouses ${res.status}`);
      }
      return res.json() as Promise<WarehousesListResponse>;
    },
    enabled,
  });

  const shipDestEnabled = meta?.shipDestinationsApi === "enabled";
  const tripsApiEnabled = meta?.tripsApi === "enabled";

  const tripsQ = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const res = await apiFetch("/api/trips");
      if (!res.ok) {
        throw new Error(`trips ${res.status}`);
      }
      return res.json() as Promise<TripsListResponse>;
    },
    enabled: enabled && tripsApiEnabled,
  });
  const purchaseDocsQ = useQuery({
    queryKey: ["purchase-documents"],
    queryFn: async () => {
      const res = await apiFetch("/api/purchase-documents");
      if (!res.ok) {
        throw new Error(`purchase-documents ${res.status}`);
      }
      return res.json() as Promise<PurchaseDocumentsListResponse>;
    },
    enabled,
  });
  const batchesNaklRefQ = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const res = await apiFetch("/api/batches");
      if (!res.ok) {
        throw new Error(`batches ${res.status}`);
      }
      return res.json() as Promise<BatchesListResponse>;
    },
    enabled,
  });
  const shipDestQ = useQuery({
    queryKey: ["ship-destinations"],
    queryFn: async () => {
      const res = await apiFetch("/api/ship-destinations");
      if (!res.ok) {
        throw new Error(`ship-destinations ${res.status}`);
      }
      return res.json() as Promise<ShipDestinationsListResponse>;
    },
    enabled: enabled && shipDestEnabled,
  });

  const deletePurchaseDocument = useMutation({
    mutationFn: async (documentId: string) => {
      setNakladError(null);
      const res = await apiFetch(`/api/purchase-documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
      if (res.status === 403) {
        throw new Error("Недостаточно прав: удаление накладных — только admin/manager (инвентарь).");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
      const res = await apiFetch("/api/ship-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        throw new Error("Нет прав: только admin/manager");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
      const res = await apiFetch(`/api/ship-destinations/${encodeURIComponent(code)}`, { method: "DELETE" });
      if (res.status === 403) {
        throw new Error("Нет прав: только admin/manager");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      setDestFormError(e.message);
    },
  });

  const gradesQ = useQuery({
    queryKey: ["product-grades"],
    queryFn: async () => {
      const res = await apiFetch("/api/product-grades");
      if (!res.ok) {
        throw new Error(`product-grades ${res.status}`);
      }
      return res.json() as Promise<ProductGradesListResponse>;
    },
    enabled,
  });

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
      const res = await apiFetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CreateWarehouseResponse>;
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
      const res = await apiFetch(`/api/warehouses/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
      const res = await apiFetch("/api/product-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CreateProductGradeResponse>;
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
      const res = await apiFetch(`/api/product-grades/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
      const res = await apiFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        throw new Error("Нет прав: создание рейса — роли admin, manager, logistics");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
      const res = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}`, { method: "DELETE" });
      if (res.status === 403) {
        throw new Error("Нет прав на удаление рейса");
      }
      if (res.status === 409) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (j.error === "trip_not_empty") {
          throw new Error(
            "Нельзя удалить: в рейсе есть отгрузка, продажа или недостача. Сначала уберите движения в «Операциях» и отчётах.",
          );
        }
        throw new Error(j.message ?? "Конфликт при удалении (409)");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
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
        <p style={muted}>
          API накладных/справочников недоступен (<code>purchaseDocumentsApi</code>).
        </p>
      </section>
    );
  }

  return (
    <section className="birzha-panel" aria-labelledby="inv-adm-heading" role="region">
      <h2 id="inv-adm-heading" className="birzha-section-title">
        Админ: накладные, рейсы, направления, склады, калибры
      </h2>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Управление справочниками и <strong>данными</strong> закупочных накладных (только admin/manager). Ввод новых
        накладных — в разделе{" "}
        <Link to={ops.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          Накладная
        </Link>{" "}
        ({prefix.operations}).
      </p>

      <div id="batches-nakl-ref" style={{ marginBottom: "0.9rem" }}>
        <h3
          style={{
            fontSize: "0.95rem",
            margin: "0 0 0.4rem",
            fontWeight: 600,
            scrollMarginTop: "0.5rem",
          }}
        >
          Партии по накладным (справка, чтение)
        </h3>
        <p style={{ ...muted, fontSize: "0.86rem", margin: "0 0 0.5rem" }}>
          Свод id партий и кг: сворачивается по каждой накладной. <strong>Отгрузка в рейс</strong> — в{" "}
          <Link to={ops.operations} style={{ fontWeight: 600 }}>
            Операциях
          </Link>
          .
        </p>
        <BatchesByNakladnayaReference
          batches={batchesNaklRefQ.data?.batches}
          isLoading={batchesNaklRefQ.isPending}
          sectionHeadingId="batches-nakl-ref-h"
          showBulkExpandControls
        />
        {batchesNaklRefQ.isError && <p style={errorText}>Партии не загрузились: {String(batchesNaklRefQ.error)}</p>}
      </div>

      {tripsApiEnabled && (
        <>
          <h3 style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.35rem" }}>Рейсы</h3>
          {tripError && <p style={errorText}>{tripError}</p>}
          <p style={{ ...muted, fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
            Создание и удаление (пустой рейс) — <code>POST/DELETE /api/trips</code>. Удалить можно только если нет
            отгрузок, продаж и недостач по рейсу. Использование в грузообороте — в{" "}
            <Link to={ops.operations}>Операциях</Link>.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "end",
              gap: "0.35rem",
              marginBottom: "0.5rem",
            }}
          >
            <div>
              <label className="birzha-field-label">id (UUID)</label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={newTripId}
                  onChange={(e) => setNewTripId(e.target.value)}
                  style={{ ...fieldStyle, width: 250 }}
                  placeholder="технический id"
                  autoComplete="off"
                />
                <button
                  type="button"
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
            <div>
              <label className="birzha-field-label">№ рейса</label>
              <input
                value={newTripNumber}
                onChange={(e) => setNewTripNumber(e.target.value)}
                style={{ ...fieldStyle, width: 100 }}
                placeholder="Ф-12"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="birzha-field-label">ТС</label>
              <input
                value={newTripVehicle}
                onChange={(e) => setNewTripVehicle(e.target.value)}
                style={{ ...fieldStyle, width: 100 }}
                placeholder="опц."
                autoComplete="off"
              />
            </div>
            <div>
              <label className="birzha-field-label">Водитель</label>
              <input
                value={newTripDriver}
                onChange={(e) => setNewTripDriver(e.target.value)}
                style={{ ...fieldStyle, width: 120 }}
                placeholder="опц."
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="inv-adm-new-trip-departed"
                className="birzha-field-label"
              >
                Отправл.
              </label>
              <BirzhaDateTimeField
                id="inv-adm-new-trip-departed"
                value={newTripDeparted}
                onChange={setNewTripDeparted}
                style={{ ...fieldStyle, maxWidth: 220, marginTop: 0.35 }}
                className="birzha-input-date"
                emptyLabel="—"
              />
            </div>
            <button
              type="button"
              style={btnStyle}
              disabled={createTrip.isPending}
              onClick={() => void createTrip.mutate()}
            >
              {createTrip.isPending ? "…" : "Создать рейс"}
            </button>
          </div>
          {tripsQ.isError && <p style={errorText}>Рейсы: {String(tripsQ.error)}</p>}
          {tripsQ.isPending && <p style={muted}>Список рейсов…</p>}
          {tripsQ.isSuccess && (
            <div style={{ overflowX: "auto", marginBottom: "0.9rem" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr>
                    <th style={thHeadDense}>№ (борт)</th>
                    <th style={thHeadDense}>Статус</th>
                    <th style={thHeadDense}>ТС</th>
                    <th style={thHeadDense}>Водитель</th>
                    <th style={thHeadDense}>id</th>
                    <th style={thHeadDense} />
                  </tr>
                </thead>
                <tbody>
                  {(tripsQ.data.trips ?? [])
                    .slice()
                    .sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru", { numeric: true }))
                    .map((t) => (
                      <tr key={t.id}>
                        <td style={thtdDense}>
                          <strong>№ {t.tripNumber}</strong>{" "}
                          <Link to={`${prefix.operations}#trips`} style={{ fontSize: "0.8rem" }}>
                            к операциям
                          </Link>
                        </td>
                        <td style={thtdDense}>{t.status}</td>
                        <td style={thtdDense}>{t.vehicleLabel ?? "—"}</td>
                        <td style={thtdDense}>{t.driverName ?? "—"}</td>
                        <td style={thtdDense}>
                          <code style={{ fontSize: "0.75rem" }} title={t.id}>
                            {t.id.slice(0, 8)}…
                          </code>
                        </td>
                        <td style={thtdDense}>
                          <button
                            type="button"
                            style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
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
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h3 style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.35rem" }}>Закупочные накладные (удаление)</h3>
      {nakladError && <p style={errorText}>{nakladError}</p>}
      {purchaseDocsQ.isError && <p style={errorText}>Не загрузились накладные: {String(purchaseDocsQ.error)}</p>}
      {purchaseDocsQ.isPending && <p style={muted}>Список накладных…</p>}
      {purchaseDocsQ.isSuccess && (
        <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
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
                        style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
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
                      <Link to={`${ops.purchaseNakladnaya}/${d.id}`} style={{ fontSize: "0.86rem" }}>
                        карточка
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {shipDestEnabled && (
        <>
          <h3 style={{ fontSize: "0.95rem", margin: "0.9rem 0 0.35rem" }}>Направления / куда везти (для «Распределения»)</h3>
          {destFormError && <p style={errorText}>{destFormError}</p>}
          {shipDestQ.isError && <p style={errorText}>Направления: {String(shipDestQ.error)}</p>}
          {shipDestQ.isPending && <p style={muted}>Справочник…</p>}
          <p style={{ ...muted, fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
            Код хранится в партии. «Удалить» — снятие с выбора (is_active = false), повтор с тем же кодом —
            обновит подпись и снова включит.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <input
              value={newDestCode}
              onChange={(e) => setNewDestCode(e.target.value)}
              style={{ ...fieldStyle, width: 120 }}
              placeholder="Код (лат.)"
              autoComplete="off"
            />
            <input
              value={newDestName}
              onChange={(e) => setNewDestName(e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 160px" }}
              placeholder="Название (как в списке)"
              autoComplete="off"
            />
            <input
              value={newDestOrder}
              onChange={(e) => setNewDestOrder(e.target.value)}
              style={{ ...fieldStyle, width: 72 }}
              placeholder="№"
              inputMode="numeric"
              autoComplete="off"
            />
            <button
              type="button"
              style={btnStyle}
              disabled={createShipDest.isPending}
              onClick={() => void createShipDest.mutate()}
            >
              {createShipDest.isPending ? "…" : "Добавить / обновить"}
            </button>
          </div>
          {shipDestQ.isSuccess && (
            <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
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
        </>
      )}

      <h3 style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.35rem" }}>Склады</h3>
      {warehousesQ.isError && (
        <p role="alert" style={errorText}>
          {warehousesQ.error instanceof Error ? warehousesQ.error.message : String(warehousesQ.error)}
        </p>
      )}
      {warehousesQ.isPending && <p style={muted}>Загрузка складов…</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <input
          value={newWarehouseName}
          onChange={(e) => setNewWarehouseName(e.target.value)}
          style={{ ...fieldStyle, flex: "1 1 160px", minWidth: 120 }}
          placeholder="Название нового склада"
          autoComplete="off"
          aria-label="Название нового склада"
        />
        <input
          value={newWarehouseCode}
          onChange={(e) => setNewWarehouseCode(e.target.value)}
          style={{ ...fieldStyle, width: 120 }}
          placeholder="Код (опц.)"
          autoComplete="off"
          aria-label="Код склада латиницей"
        />
        <button type="button" style={btnStyle} disabled={createWarehouse.isPending} onClick={() => void createWarehouse.mutate()}>
          {createWarehouse.isPending ? "…" : "Добавить склад"}
        </button>
      </div>
      {warehouseFormError && <p style={errorText}>{warehouseFormError}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
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
                    style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
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

      <h3 style={{ fontSize: "0.95rem", margin: "0.9rem 0 0.35rem" }}>Калибры (сорта)</h3>
      {gradesQ.isError && (
        <p role="alert" style={errorText}>
          {gradesQ.error instanceof Error ? gradesQ.error.message : String(gradesQ.error)}
        </p>
      )}
      {gradesQ.isPending && <p style={muted}>Загрузка калибров…</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <input
          value={newGradeProductGroup}
          onChange={(e) => setNewGradeProductGroup(e.target.value)}
          style={{ ...fieldStyle, flex: "1 1 120px", minWidth: 100 }}
          placeholder="Группа (опц.)"
          autoComplete="off"
        />
        <input
          value={newGradeCode}
          onChange={(e) => setNewGradeCode(e.target.value)}
          style={{ ...fieldStyle, width: 88 }}
          placeholder="Код"
          autoComplete="off"
        />
        <input
          value={newGradeDisplayName}
          onChange={(e) => setNewGradeDisplayName(e.target.value)}
          style={{ ...fieldStyle, flex: "1 1 140px", minWidth: 120 }}
          placeholder="Подпись"
          autoComplete="off"
        />
        <input
          value={newGradeSortOrder}
          onChange={(e) => setNewGradeSortOrder(e.target.value)}
          style={{ ...fieldStyle, width: 72 }}
          placeholder="Порядок"
          inputMode="numeric"
          autoComplete="off"
        />
        <button type="button" style={btnStyle} disabled={createProductGrade.isPending} onClick={() => void createProductGrade.mutate()}>
          {createProductGrade.isPending ? "…" : "Добавить калибр"}
        </button>
      </div>
      {gradeFormError && <p style={errorText}>{gradeFormError}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
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
                      style={{ ...btnStyle, fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
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
    </section>
  );
}
