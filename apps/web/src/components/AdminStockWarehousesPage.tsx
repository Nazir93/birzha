import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiDelete, apiPostJson } from "../api/fetch-api.js";
import type { CreateWarehouseResponse } from "../api/types.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

export function AdminStockWarehousesPage() {
  const queryClient = useQueryClient();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [gradeSearch, setGradeSearch] = useState("");
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseCode, setNewWarehouseCode] = useState("");
  const [warehouseFormError, setWarehouseFormError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.warehouses });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  };

  const warehousesQ = useQuery(warehousesFullListQueryOptions());
  const batchesQ = useQuery({
    ...batchesFullListQueryOptions(),
    refetchOnMount: "always",
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
      return apiPostJson("/api/warehouses", body) as Promise<CreateWarehouseResponse>;
    },
    onSuccess: (res) => {
      setNewWarehouseName("");
      setNewWarehouseCode("");
      setSelectedWarehouseId(res.warehouse.id);
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
      setSelectedWarehouseId("");
      invalidate();
    },
  });

  /** Суммы по партициям одного калибра и вида на выбранном складе (без разбивки по накладным). */
  const gradeStockAggregates = useMemo(() => {
    const wid = selectedWarehouseId.trim();
    if (!wid) {
      return [];
    }
    const q = gradeSearch.trim().toLowerCase();
    type Agg = { gradeCode: string; productGroup: string; onWarehouseKg: number; inTransitKg: number; soldKg: number };
    const map = new Map<string, Agg>();
    for (const b of batchesQ.data?.batches ?? []) {
      if ((b.nakladnaya?.warehouseId ?? "") !== wid) {
        continue;
      }
      const gradeCode = (b.nakladnaya?.productGradeCode ?? "").trim() || "—";
      const productGroup = (b.nakladnaya?.productGroup ?? "").trim() || "—";
      const key = `${gradeCode}\0${productGroup}`;
      const prev = map.get(key) ?? { gradeCode, productGroup, onWarehouseKg: 0, inTransitKg: 0, soldKg: 0 };
      prev.onWarehouseKg += b.onWarehouseKg ?? 0;
      prev.inTransitKg += b.inTransitKg ?? 0;
      prev.soldKg += b.soldKg ?? 0;
      map.set(key, prev);
    }
    let rows = [...map.values()].filter(
      (r) => r.onWarehouseKg > 0 || r.inTransitKg > 0 || r.soldKg > 0,
    );
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.gradeCode} ${r.productGroup}`.toLowerCase();
        return hay.includes(q);
      });
    }
    rows.sort((a, b) => a.gradeCode.localeCompare(b.gradeCode, "ru"));
    return rows;
  }, [batchesQ.data?.batches, selectedWarehouseId, gradeSearch]);

  const loading = warehousesQ.isPending || batchesQ.isPending;

  return (
    <div className="birzha-admin-dash" role="region" aria-labelledby="stock-wh-h">
      <header style={{ marginBottom: "0.85rem" }}>
        <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
          <Link to={adminRoutes.home} className="birzha-ui-sm">
            ← Сводка
          </Link>{" "}
          ·{" "}
          <Link to={`${adminRoutes.inventory}#inv-product-grades`} className="birzha-ui-sm">
            Калибры в справочнике
          </Link>
        </p>
        <h2 id="stock-wh-h" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          Склады и остатки
        </h2>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem", color: "var(--color-muted)", maxWidth: 52 * 16 }}>
          Справочник складов, добавление и удаление. Выберите склад — внизу итоги по калибру (все накладные суммируются в
          одну строку на калибр). Поиск — по калибру и виду товара.
        </p>
      </header>

      {loading ? <LoadingBlock label="Загрузка…" minHeight={72} skeleton skeletonRows={4} /> : null}
      {warehousesQ.isError ? (
        <p role="alert" style={errorText}>
          Склады не загрузились.
        </p>
      ) : null}

      {!loading && !warehousesQ.isError ? (
        <>
          <BirzhaDisclosure defaultOpen title={<span style={{ fontWeight: 600 }}>Склады</span>}>
            <div className="birzha-inventory-inline-tools birzha-inventory-inline-tools--catalog" style={{ marginBottom: "0.65rem" }}>
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
            {warehouseFormError ? <p style={errorText}>{warehouseFormError}</p> : null}
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={{ ...tableStyle, minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={thHeadDense}>Название</th>
                    <th style={thHeadDense}>Код</th>
                    <th style={thHeadDense}>Остаток на складе</th>
                    <th style={thHeadDense} />
                  </tr>
                </thead>
                <tbody>
                  {(warehousesQ.data?.warehouses ?? []).map((w) => {
                    const kg = (batchesQ.data?.batches ?? [])
                      .filter((b) => (b.nakladnaya?.warehouseId ?? "") === w.id)
                      .reduce((s, b) => s + (b.onWarehouseKg ?? 0), 0);
                    const active = selectedWarehouseId === w.id;
                    return (
                      <tr key={w.id}>
                        <td style={thtdDense}>
                          <button
                            type="button"
                            onClick={() => setSelectedWarehouseId(w.id)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              fontWeight: active ? 800 : 600,
                              color: "inherit",
                              textAlign: "left",
                              textDecoration: active ? "underline" : undefined,
                            }}
                          >
                            {w.name}
                          </button>
                        </td>
                        <td style={thtdDense}>
                          <code style={{ fontSize: "0.82rem" }}>{w.code}</code>
                        </td>
                        <td style={thtdDense}>{kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </BirzhaDisclosure>

          <BirzhaDisclosure
            defaultOpen
            title={<span style={{ fontWeight: 600 }}>Остатки по выбранному складу</span>}
          >
            {!selectedWarehouseId ? null : (
              <>
                <label className="birzha-field-label" htmlFor="stock-grade-search">
                  Поиск по калибру и виду товара
                </label>
                <input
                  id="stock-grade-search"
                  value={gradeSearch}
                  onChange={(e) => setGradeSearch(e.target.value)}
                  style={{ ...fieldStyle, maxWidth: "24rem", marginBottom: "0.65rem" }}
                  placeholder="Например №5 или помидоры"
                  autoComplete="off"
                />
                {gradeStockAggregates.length === 0 ? null : (
                  <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                    <table style={{ ...tableStyle, minWidth: 420 }}>
                      <thead>
                        <tr>
                          <th style={thHeadDense}>Калибр</th>
                          <th style={thHeadDense}>Вид</th>
                          <th style={thHeadDense}>На складе, кг</th>
                          <th style={thHeadDense}>Погружено, кг</th>
                          <th style={thHeadDense}>Продано, кг</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeStockAggregates.map((r) => (
                          <tr key={`${r.gradeCode}\0${r.productGroup}`}>
                            <td style={thtdDense}>
                              <strong>{r.gradeCode}</strong>
                            </td>
                            <td style={thtdDense}>{r.productGroup}</td>
                            <td style={thtdDense}>
                              {r.onWarehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                            </td>
                            <td style={thtdDense}>{r.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                            <td style={thtdDense}>{r.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
