import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compareProductGradeCodes } from "@birzha/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiDelete, apiPostJson } from "../api/fetch-api.js";
import type { CreateWarehouseResponse } from "../api/types.js";
import {
  batchesForWarehouseQueryOptions,
  queryRoots,
  stockBalancesQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

export function AdminStockWarehousesPage() {
  const queryClient = useQueryClient();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [gradeSearch, setGradeSearch] = useState("");
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [warehouseFormError, setWarehouseFormError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.warehouses });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.stockBalances });
  };

  const warehousesQ = useQuery(warehousesFullListQueryOptions());
  const stockBalancesQ = useQuery(stockBalancesQueryOptions());
  const selectedWhId = selectedWarehouseId.trim();
  const batchesQ = useQuery({
    ...batchesForWarehouseQueryOptions(selectedWhId, 500),
    enabled: selectedWhId.length > 0,
    refetchOnMount: "always",
  });

  const warehouseKgById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockBalancesQ.data?.byWarehouse ?? []) {
      map.set(row.warehouseId, row.onWarehouseKg);
    }
    return map;
  }, [stockBalancesQ.data?.byWarehouse]);

  useEffect(() => {
    if (selectedWarehouseId.trim().length > 0 || !warehousesQ.isSuccess || stockBalancesQ.isPending) {
      return;
    }
    const withStock = stockBalancesQ.data?.byWarehouse
      .filter((row) => row.onWarehouseKg > 0)
      .sort((a, b) => b.onWarehouseKg - a.onWarehouseKg);
    const pick = withStock?.[0]?.warehouseId ?? warehousesQ.data?.warehouses?.[0]?.id;
    if (pick) {
      setSelectedWarehouseId(pick);
    }
  }, [
    selectedWarehouseId,
    warehousesQ.isSuccess,
    warehousesQ.data?.warehouses,
    stockBalancesQ.isPending,
    stockBalancesQ.data?.byWarehouse,
  ]);

  const createWarehouse = useMutation({
    mutationFn: async () => {
      setWarehouseFormError(null);
      const name = newWarehouseName.trim();
      if (!name) {
        throw new Error("Введите название склада");
      }
      return apiPostJson("/api/warehouses", { name }) as Promise<CreateWarehouseResponse>;
    },
    onSuccess: (res) => {
      setNewWarehouseName("");
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
    if (!selectedWhId) {
      return [];
    }
    const q = gradeSearch.trim().toLowerCase();
    type Agg = { gradeCode: string; productGroup: string; onWarehouseKg: number; inTransitKg: number; soldKg: number };
    const map = new Map<string, Agg>();
    for (const b of batchesQ.data?.batches ?? []) {
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
    rows.sort((a, b) => {
      const pg = a.productGroup.localeCompare(b.productGroup, "ru");
      if (pg !== 0) {
        return pg;
      }
      return compareProductGradeCodes(a.gradeCode, b.gradeCode);
    });
    return rows;
  }, [batchesQ.data?.batches, selectedWhId, gradeSearch]);

  const loading =
    warehousesQ.isPending || stockBalancesQ.isPending || (selectedWhId.length > 0 && batchesQ.isPending);

  return (
    <div className="birzha-admin-dash birzha-section-shell" role="region" aria-labelledby="stock-wh-h">
      <header className="birzha-section-hero">
        <p className="birzha-section-backlink">
          <Link to={adminRoutes.home} className="birzha-ui-sm">
            ← Сводка
          </Link>{" "}
          ·{" "}
          <Link to={`${adminRoutes.settingsCatalog}#inv-product-grades`} className="birzha-ui-sm">
            Калибры в справочнике
          </Link>
        </p>
        <h2 id="stock-wh-h" className="birzha-section-title-main" style={{ marginBottom: 0 }}>
          Склады и остатки
        </h2>
        <p className="birzha-ui-sm birzha-section-note" style={{ marginTop: "0.35rem", maxWidth: 52 * 16 }}>
          Справочник складов, добавление и удаление. Выберите склад — внизу итоги по калибру (все накладные суммируются в
          одну строку на калибр). Поиск — по калибру и виду товара.
        </p>
      </header>

      {loading ? <LoadingBlock label="Загрузка…" minHeight={72} skeleton skeletonRows={4} /> : null}
      {warehousesQ.isError ? <ErrorAlert message="Склады не загрузились." title="Склады" /> : null}
      {stockBalancesQ.isError ? (
        <ErrorAlert message="Остатки по складам не загрузились." title="Остатки" />
      ) : null}

      {!loading && !warehousesQ.isError ? (
        <>
          <BirzhaDisclosure defaultOpen title={<span className="birzha-section-title-inline">Склады</span>}>
            <div className="birzha-inventory-inline-tools birzha-inventory-inline-tools--catalog" style={{ marginBottom: "0.65rem" }}>
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
                    <th style={thHeadDense}>Остаток на складе</th>
                    <th style={thHeadDense} />
                  </tr>
                </thead>
                <tbody>
                  {(warehousesQ.data?.warehouses ?? []).map((w) => {
                    const kg = warehouseKgById.get(w.id) ?? 0;
                    const active = selectedWhId === w.id;
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
                              fontWeight: active ? 800 : 600,
                              color: "inherit",
                              textAlign: "left",
                              textDecoration: active ? "underline" : undefined,
                            }}
                          >
                            {w.name}
                          </button>
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
            title={<span className="birzha-section-title-inline">Остатки по выбранному складу</span>}
          >
            {!selectedWhId ? (
              <p className="birzha-text-muted birzha-ui-sm" role="status">
                Выберите склад в таблице выше.
              </p>
            ) : batchesQ.isError ? (
              <ErrorAlert message="Не удалось загрузить партии по складу." title="Остатки по калибру" />
            ) : (
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
                {gradeStockAggregates.length === 0 && !batchesQ.isPending ? (
                  <p className="birzha-text-muted birzha-ui-sm" role="status">
                    На этом складе нет остатка по партиям.
                  </p>
                ) : null}
                {gradeStockAggregates.length > 0 ? (
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
                ) : null}
              </>
            )}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
