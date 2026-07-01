import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { apiDelete, apiDeleteOr403, apiPostJson, apiPostJsonOr403 } from "../api/fetch-api.js";
import type {
  CreateProductGradeResponse,
  CreateWarehouseResponse,
} from "../api/types.js";
import {
  productGradesFullListQueryOptions,
  queryRoots,
  shipDestinationsFullListQueryOptions,
  warehousesFullListQueryOptions,
  wholesalersFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes } from "../routes.js";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";
/**
 * Справочники админки: склады, калибры, направления логистики и оптовики.
 */
type InventoryAdminPanelProps = {
  /** Внутри раздела «Настройки» — без отдельного заголовка страницы. */
  embedded?: boolean;
};

type CatalogSection = "warehouses" | "grades" | "logistics" | "wholesalers";

function sectionTabClassName(active: boolean): string {
  return `birzha-settings-tabs__tab${active ? " birzha-settings-tabs__tab--active" : ""}`;
}

export function InventoryAdminPanel({ embedded = false }: InventoryAdminPanelProps = {}) {
  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";
  const shipDestEnabled = meta?.shipDestinationsApi === "enabled";
  const wholesalersEnabled = meta?.wholesalersCatalogApi === "enabled";
  const [activeSection, setActiveSection] = useState<CatalogSection>("warehouses");
  const [newWarehouseName, setNewWarehouseName] = useState("");
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
  const [wholesalerFormError, setWholesalerFormError] = useState<string | null>(null);
  const [newWholesalerName, setNewWholesalerName] = useState("");
  const [newWholesalerOrder, setNewWholesalerOrder] = useState("");

  const sectionFromUrl = searchParams.get("section");

  useEffect(() => {
    const v = (sectionFromUrl ?? "").trim();
    if (v === "warehouses" || v === "grades" || v === "logistics" || v === "wholesalers") {
      setActiveSection(v);
    }
  }, [sectionFromUrl]);

  useEffect(() => {
    const current = (searchParams.get("section") ?? "").trim();
    if (current === activeSection) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("section", activeSection);
    setSearchParams(next, { replace: true });
  }, [activeSection, searchParams, setSearchParams]);

  useEffect(() => {
    if (hash !== "#inv-product-grades") {
      return;
    }
    setActiveSection("grades");
    const el = document.getElementById("inv-product-grades");
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (el.tagName === "DETAILS" && !el.hasAttribute("open")) {
        el.setAttribute("open", "");
      }
    }
  }, [hash]);

  useEffect(() => {
    if (activeSection === "logistics" && !shipDestEnabled) {
      setActiveSection("warehouses");
      return;
    }
    if (activeSection === "wholesalers" && !wholesalersEnabled) {
      setActiveSection("warehouses");
    }
  }, [activeSection, shipDestEnabled, wholesalersEnabled]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.warehouses });
    void queryClient.invalidateQueries({ queryKey: queryRoots.productGrades });
    void queryClient.invalidateQueries({ queryKey: queryRoots.purchaseDocuments });
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipDestinations });
    void queryClient.invalidateQueries({ queryKey: queryRoots.wholesalers });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  }, [queryClient]);

  const warehousesQ = useQuery({ ...warehousesFullListQueryOptions(), enabled });

  const shipDestQ = useQuery({
    ...shipDestinationsFullListQueryOptions(),
    enabled: enabled && shipDestEnabled,
  });
  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled: enabled && wholesalersEnabled,
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

  const createWholesaler = useMutation({
    mutationFn: async () => {
      setWholesalerFormError(null);
      const name = newWholesalerName.trim();
      if (!name) {
        throw new Error("Введите название оптовика");
      }
      const body: { name: string; sortOrder?: number } = { name };
      const so = newWholesalerOrder.trim();
      if (so) {
        const n = Number.parseInt(so, 10);
        if (!Number.isInteger(n) || n < 0 || n > 9999) {
          throw new Error("Порядок — целое 0…9999 или пусто");
        }
        body.sortOrder = n;
      }
      await apiPostJsonOr403("/api/wholesalers", body, "Нет прав: только admin");
    },
    onSuccess: () => {
      setNewWholesalerName("");
      setNewWholesalerOrder("");
      invalidate();
    },
    onError: (e: Error) => {
      setWholesalerFormError(e.message);
    },
  });

  const deleteWholesaler = useMutation({
    mutationFn: async (id: string) => {
      setWholesalerFormError(null);
      await apiDeleteOr403(
        `/api/wholesalers/${encodeURIComponent(id)}`,
        "Нет прав: только admin",
      );
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      setWholesalerFormError(e.message);
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
      return apiPostJson("/api/warehouses", { name }) as Promise<CreateWarehouseResponse>;
    },
    onSuccess: () => {
      setNewWarehouseName("");
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

  if (!enabled) {
    return (
      <section className="birzha-panel">
        <p className="birzha-callout-warning" role="status">
          Накладные и справочники временно недоступны. Проверьте сервер или обратитесь к администратору.
        </p>
      </section>
    );
  }

  const content = (
    <>
      {!embedded ? (
        <header className="birzha-home-hero birzha-inventory-admin__hero">
          <div>
            <p className="birzha-home-hero__eyebrow">Справочники</p>
            <h2 id="inv-adm-heading" className="birzha-home-hero__title">
              Справочники системы
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
      ) : null}

      <nav className="birzha-settings-tabs no-print" aria-label="Разделы справочников">
        <button
          type="button"
          className={sectionTabClassName(activeSection === "warehouses")}
          onClick={() => setActiveSection("warehouses")}
        >
          Склады
        </button>
        <button
          type="button"
          className={sectionTabClassName(activeSection === "grades")}
          onClick={() => setActiveSection("grades")}
        >
          Калибры
        </button>
        {shipDestEnabled ? (
          <button
            type="button"
            className={sectionTabClassName(activeSection === "logistics")}
            onClick={() => setActiveSection("logistics")}
          >
            Логистика
          </button>
        ) : null}
        {wholesalersEnabled ? (
          <button
            type="button"
            className={sectionTabClassName(activeSection === "wholesalers")}
            onClick={() => setActiveSection("wholesalers")}
          >
            Оптовики
          </button>
        ) : null}
      </nav>

      {shipDestEnabled && activeSection === "logistics" && (
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
          >
          {destFormError ? <ErrorAlert message={destFormError} title="Направление" /> : null}
          {shipDestQ.isError ? <ErrorAlert error={shipDestQ.error} title="Направления" /> : null}
          {shipDestQ.isPending && (
            <LoadingBlock label="Справочник направлений…" minHeight={48} skeleton skeletonRows={3} />
          )}
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
              className="birzha-btn birzha-btn--spaced birzha-inventory-inline-tools__submit"
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
                              className="birzha-btn birzha-btn--inline"
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

      {wholesalersEnabled && activeSection === "wholesalers" && (
        <>
          <BirzhaDisclosure
            defaultOpen
            title={
              <span className="birzha-disclosure__title-stack">
                <span className="birzha-section-heading__eyebrow">Продажи</span>
                <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Оптовики (для «Опт» у продавца)</span>
              </span>
            }
          >
            {wholesalerFormError ? <ErrorAlert message={wholesalerFormError} title="Оптовик" /> : null}
            {wholesalersQ.isError ? <ErrorAlert error={wholesalersQ.error} title="Оптовики" /> : null}
            {wholesalersQ.isPending && (
              <LoadingBlock label="Справочник оптовиков…" minHeight={48} skeleton skeletonRows={3} />
            )}
            <p className="birzha-callout-info" style={{ fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
              «Удалить» — снятие с выбора (неактивен); продажи сохраняют подпись в отчёте.
            </p>
            <div className="birzha-inventory-inline-tools">
              <input
                value={newWholesalerName}
                onChange={(e) => setNewWholesalerName(e.target.value)}
                style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
                placeholder="Название оптовика"
                autoComplete="off"
                aria-label="Название оптовика"
              />
              <input
                value={newWholesalerOrder}
                onChange={(e) => setNewWholesalerOrder(e.target.value)}
                style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
                placeholder="Порядок"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Порядок сортировки оптовика"
              />
              <button
                type="button"
                className="birzha-btn birzha-btn--spaced birzha-inventory-inline-tools__submit"
                disabled={createWholesaler.isPending}
                onClick={() => void createWholesaler.mutate()}
              >
                {createWholesaler.isPending ? "…" : "Добавить"}
              </button>
            </div>
            {wholesalersQ.isSuccess && (
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "0.75rem" }}>
                <table style={{ ...tableStyle, minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={thHeadDense}>Название</th>
                      <th style={thHeadDense}>Порядок</th>
                      <th style={thHeadDense}>Активн.</th>
                      <th style={thHeadDense} />
                    </tr>
                  </thead>
                  <tbody>
                    {(wholesalersQ.data.wholesalers ?? [])
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"))
                      .map((r) => (
                        <tr key={r.id}>
                          <td style={thtdDense}>{r.name}</td>
                          <td style={thtdDense}>{r.sortOrder}</td>
                          <td style={thtdDense}>{r.isActive ? "да" : "нет"}</td>
                          <td style={thtdDense}>
                            {r.isActive ? (
                              <button
                                type="button"
                                className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                                disabled={deleteWholesaler.isPending}
                                onClick={() => {
                                  if (window.confirm(`Снять оптовика «${r.name}»?`)) {
                                    void deleteWholesaler.mutate(r.id);
                                  }
                                }}
                              >
                                Удалить
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

      {activeSection === "warehouses" ? (
        <BirzhaDisclosure
          defaultOpen
          title={
            <span className="birzha-disclosure__title-stack">
              <span className="birzha-section-heading__eyebrow">Справочник</span>
              <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Склады</span>
            </span>
          }
        >
      {warehousesQ.isError ? <ErrorAlert error={warehousesQ.error} title="Склады" /> : null}
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
        <button
          type="button"
          className="birzha-btn birzha-btn--spaced birzha-inventory-inline-tools__submit"
          disabled={createWarehouse.isPending}
          onClick={() => void createWarehouse.mutate()}
        >
          {createWarehouse.isPending ? "…" : "Добавить склад"}
        </button>
      </div>
      {warehouseFormError ? <ErrorAlert message={warehouseFormError} title="Склад" /> : null}
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ ...tableStyle, minWidth: 420 }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Название</th>
              <th style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {(warehousesQ.data?.warehouses ?? []).map((w) => (
              <tr key={w.id}>
                <td style={thtdDense}>{w.name}</td>
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
      ) : null}

      {activeSection === "grades" ? (
        <BirzhaDisclosure
          id="inv-product-grades"
          defaultOpen
          title={
            <span className="birzha-disclosure__title-stack">
              <span className="birzha-section-heading__eyebrow">Справочник</span>
              <span style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>Калибры (сорта)</span>
            </span>
          }
        >
      {gradesQ.isError ? <ErrorAlert error={gradesQ.error} title="Калибры" /> : null}
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
          className="birzha-btn birzha-btn--spaced birzha-inventory-inline-tools__submit"
          disabled={createProductGrade.isPending}
          onClick={() => void createProductGrade.mutate()}
        >
          {createProductGrade.isPending ? "…" : "Добавить калибр"}
        </button>
      </div>
      {gradeFormError ? <ErrorAlert message={gradeFormError} title="Калибр" /> : null}
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
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className="birzha-inventory-admin birzha-settings-admin__embedded" aria-label="Справочники системы">
        {content}
      </div>
    );
  }

  return (
    <section className="birzha-home-premium birzha-inventory-admin" aria-labelledby="inv-adm-heading">
      {content}
    </section>
  );
}
