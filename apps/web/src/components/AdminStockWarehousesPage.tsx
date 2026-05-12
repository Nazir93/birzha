import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiDelete, apiPostJson } from "../api/fetch-api.js";
import type { BatchListItem, CreateWarehouseResponse } from "../api/types.js";
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
  const batchesQ = useQuery(batchesFullListQueryOptions());

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

  const stockRows = useMemo(() => {
    const wid = selectedWarehouseId.trim();
    if (!wid) {
      return [] as BatchListItem[];
    }
    const q = gradeSearch.trim().toLowerCase();
    const list = (batchesQ.data?.batches ?? []).filter((b) => {
      if ((b.nakladnaya?.warehouseId ?? "") !== wid) {
        return false;
      }
      if ((b.onWarehouseKg ?? 0) <= 0) {
        return false;
      }
      if (!q) {
        return true;
      }
      const code = (b.nakladnaya?.productGradeCode ?? "").toLowerCase();
      const group = (b.nakladnaya?.productGroup ?? "").toLowerCase();
      const doc = (b.nakladnaya?.documentNumber ?? "").toLowerCase();
      const hay = `${code} ${group} ${doc}`;
      return hay.includes(q);
    });
    list.sort((a, b) => (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru"));
    return list;
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
          Справочник складов, добавление и удаление. Выберите склад — таблица покажет партии с остатком на складе. Поиск по
          коду калибра, виду товара и номеру накладной.
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
          <BirzhaDisclosure defaultOpen title={<span style={{ fontWeight: 600 }}>Склады</span>} hint="справочник">
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
            hint={selectedWarehouseId ? "партии, кг на складе" : "выберите склад в таблице выше"}
          >
            {!selectedWarehouseId ? (
              <p className="birzha-text-muted" style={{ margin: 0 }}>
                Нажмите название склада в списке.
              </p>
            ) : (
              <>
                <label className="birzha-field-label" htmlFor="stock-grade-search">
                  Поиск по калибру / виду / накладной
                </label>
                <input
                  id="stock-grade-search"
                  value={gradeSearch}
                  onChange={(e) => setGradeSearch(e.target.value)}
                  style={{ ...fieldStyle, maxWidth: "24rem", marginBottom: "0.65rem" }}
                  placeholder="Например №5 или помидоры"
                  autoComplete="off"
                />
                {stockRows.length === 0 ? (
                  <p style={{ margin: 0 }} className="birzha-text-muted">
                    Нет строк с остатком на этом складе (или ничего не найдено по поиску).
                  </p>
                ) : (
                  <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                    <table style={{ ...tableStyle, minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th style={thHeadDense}>Калибр</th>
                          <th style={thHeadDense}>Вид</th>
                          <th style={thHeadDense}>Накладная</th>
                          <th style={thHeadDense}>На складе, кг</th>
                          <th style={thHeadDense}>В пути, кг</th>
                          <th style={thHeadDense}>Продано, кг</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockRows.map((b) => (
                          <tr key={b.id}>
                            <td style={thtdDense}>
                              <strong>{b.nakladnaya?.productGradeCode ?? "—"}</strong>
                            </td>
                            <td style={thtdDense}>{b.nakladnaya?.productGroup ?? "—"}</td>
                            <td style={thtdDense} className="birzha-text-muted birzha-text-muted--sm">
                              {b.nakladnaya?.documentNumber ?? b.nakladnaya?.documentId?.slice(0, 8) ?? "—"}
                            </td>
                            <td style={thtdDense}>{b.onWarehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                            <td style={thtdDense}>{b.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                            <td style={thtdDense}>{b.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
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
