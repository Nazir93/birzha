import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compareProductGradeCodes } from "@birzha/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiDelete, apiPostJson } from "../api/fetch-api.js";
import type { BatchListItem, CreateWarehouseResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import {
  batchesForWarehouseQueryOptions,
  queryRoots,
  stockBalancesQueryOptions,
  warehouseWriteOffsLedgerQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminRoutes, purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { batchAvailableForLoadingKg } from "../format/batch-available-for-loading.js";
import {
  aggregateWarehouseDocumentsFromBatches,
  batchHasStockActivity,
  batchWrittenOffKg,
  estimateBatchWarehousePackages,
} from "../format/warehouse-purchase-documents-aggregate.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { fieldStyle, tableStyle, thHeadDense, thtdDense } from "../ui/styles.js";

export function AdminStockWarehousesPage() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const writeOffApiEnabled = meta?.warehouseWriteOffApi === "enabled";
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [gradeSearch, setGradeSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
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
  const warehouseBatches = useMemo(
    () => (batchesQ.data?.batches ?? []).filter(batchHasStockActivity),
    [batchesQ.data?.batches],
  );
  const writeOffsQ = useQuery({
    ...warehouseWriteOffsLedgerQueryOptions({ warehouseId: selectedWhId, limit: 200 }),
    enabled: writeOffApiEnabled && selectedWhId.length > 0,
    refetchOnMount: "always",
  });

  const warehouseKgById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockBalancesQ.data?.byWarehouse ?? []) {
      map.set(row.warehouseId, row.onWarehouseKg);
    }
    return map;
  }, [stockBalancesQ.data?.byWarehouse]);

  const warehousePackagesById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockBalancesQ.data?.byWarehouse ?? []) {
      map.set(row.warehouseId, row.onWarehousePackages ?? 0);
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

  function estimateWarehousePackages(batch: BatchListItem): number {
    return estimateBatchWarehousePackages(batch);
  }

  /** Суммы по партициям одного калибра и вида на выбранном складе (без разбивки по накладным). */
  const gradeStockAggregates = useMemo(() => {
    if (!selectedWhId) {
      return [];
    }
    const q = gradeSearch.trim().toLowerCase();
    type Agg = {
      gradeCode: string;
      productGroup: string;
      onWarehouseKg: number;
      availableForLoadingKg: number;
      onWarehousePackages: number;
      inTransitKg: number;
      soldKg: number;
      writtenOffKg: number;
    };
    const map = new Map<string, Agg>();
    for (const b of warehouseBatches) {
      const gradeCode = (b.nakladnaya?.productGradeCode ?? "").trim() || "—";
      const productGroup = (b.nakladnaya?.productGroup ?? "").trim() || "—";
      const key = `${gradeCode}\0${productGroup}`;
      const prev = map.get(key) ?? {
        gradeCode,
        productGroup,
        onWarehouseKg: 0,
        availableForLoadingKg: 0,
        onWarehousePackages: 0,
        inTransitKg: 0,
        soldKg: 0,
        writtenOffKg: 0,
      };
      prev.onWarehouseKg += b.onWarehouseKg ?? 0;
      prev.availableForLoadingKg += batchAvailableForLoadingKg(b);
      prev.onWarehousePackages += estimateWarehousePackages(b);
      prev.inTransitKg += b.inTransitKg ?? 0;
      prev.soldKg += b.soldKg ?? 0;
      prev.writtenOffKg += batchWrittenOffKg(b);
      map.set(key, prev);
    }
    let rows = [...map.values()].filter(
      (r) => r.onWarehouseKg > 0 || r.inTransitKg > 0 || r.soldKg > 0 || r.writtenOffKg > 0,
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
  }, [warehouseBatches, selectedWhId, gradeSearch]);

  const selectedWarehouseStats = useMemo(() => {
    const rows = gradeStockAggregates;
    if (rows.length === 0) {
      return null;
    }
    const totalKg = rows.reduce((acc, row) => acc + row.onWarehouseKg, 0);
    const availableForLoadingKg = rows.reduce((acc, row) => acc + row.availableForLoadingKg, 0);
    const totalPackages = rows.reduce((acc, row) => acc + row.onWarehousePackages, 0);
    const writtenOffKg = rows.reduce((acc, row) => acc + row.writtenOffKg, 0);
    return {
      calibersCount: rows.length,
      totalKg,
      availableForLoadingKg,
      totalPackages,
      writtenOffKg,
    };
  }, [gradeStockAggregates]);

  const warehouseDocumentAggregates = useMemo(() => {
    if (!selectedWhId) {
      return [];
    }
    return aggregateWarehouseDocumentsFromBatches(warehouseBatches, {
      search: documentSearch,
    });
  }, [warehouseBatches, selectedWhId, documentSearch]);

  const writeOffLines = writeOffsQ.data?.lines ?? [];
  const writeOffSumKg = useMemo(() => writeOffLines.reduce((acc, row) => acc + row.kg, 0), [writeOffLines]);

  const selectedWarehouseName = useMemo(() => {
    if (!selectedWhId) {
      return "";
    }
    const found = (warehousesQ.data?.warehouses ?? []).find((w) => w.id === selectedWhId);
    return found?.name ?? "";
  }, [warehousesQ.data?.warehouses, selectedWhId]);

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
          Справочник складов, добавление и удаление. Выберите склад — ниже закупочные накладные, остатки по калибру и
          журнал возвратов на склад при погрузке. Поиск — по номеру накладной или по калибру и виду товара.
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
                    <th style={thHeadDense}>Ящики на складе</th>
                    <th style={thHeadDense} />
                  </tr>
                </thead>
                <tbody>
                  {(warehousesQ.data?.warehouses ?? []).map((w) => {
                    const kg = warehouseKgById.get(w.id) ?? 0;
                    const packages = warehousePackagesById.get(w.id) ?? 0;
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
                            <span className="birzha-text-muted birzha-ui-sm"> ({w.code})</span>
                          </button>
                        </td>
                        <td style={thtdDense}>{kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг</td>
                        <td style={thtdDense}>{packages.toLocaleString("ru-RU")} ящ.</td>
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
            title={
              <span className="birzha-section-title-inline">
                Остатки по выбранному складу
                {selectedWarehouseName ? `: ${selectedWarehouseName}` : ""}
              </span>
            }
          >
            {!selectedWhId ? (
              <p className="birzha-text-muted birzha-ui-sm" role="status">
                Выберите склад в таблице выше.
              </p>
            ) : batchesQ.isError ? (
              <ErrorAlert message="Не удалось загрузить партии по складу." title="Остатки по калибру" />
            ) : (
              <>
                <BirzhaDisclosure
                  defaultOpen
                  title={
                    <span className="birzha-section-title-inline">
                      Закупочные накладные на складе
                      {selectedWarehouseName ? `: ${selectedWarehouseName}` : ""}
                    </span>
                  }
                >
                  <label className="birzha-field-label" htmlFor="stock-document-search">
                    Поиск по номеру накладной
                  </label>
                  <input
                    id="stock-document-search"
                    value={documentSearch}
                    onChange={(e) => setDocumentSearch(e.target.value)}
                    style={{ ...fieldStyle, maxWidth: "24rem", marginBottom: "0.65rem" }}
                    placeholder="Например НФ-0426"
                    autoComplete="off"
                  />
                  {warehouseDocumentAggregates.length === 0 && !batchesQ.isPending ? (
                    <p className="birzha-text-muted birzha-ui-sm" role="status">
                      На этом складе нет накладных с остатком, погрузкой, продажами или возвратами по партиям.
                    </p>
                  ) : null}
                  {warehouseDocumentAggregates.length > 0 ? (
                    <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                      <table style={{ ...tableStyle, minWidth: 480 }}>
                        <thead>
                          <tr>
                            <th style={thHeadDense}>№ накладной</th>
                            <th style={thHeadDense}>Строк</th>
                            <th style={thHeadDense}>На складе, кг</th>
                            <th style={thHeadDense}>На складе, ящ.</th>
                            <th style={thHeadDense}>Погружено, кг</th>
                            <th style={thHeadDense}>Продано, кг</th>
                            <th style={thHeadDense}>Возвращено, кг</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warehouseDocumentAggregates.map((row) => (
                            <tr key={row.documentId}>
                              <td style={thtdDense}>
                                <Link
                                  to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                                  style={{ fontWeight: 600 }}
                                >
                                  {row.documentNumber}
                                </Link>
                              </td>
                              <td style={thtdDense}>{row.lineCount}</td>
                              <td style={thtdDense}>
                                {row.onWarehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                              </td>
                              <td style={thtdDense}>{row.onWarehousePackages.toLocaleString("ru-RU")}</td>
                              <td style={thtdDense}>
                                {row.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                              </td>
                              <td style={thtdDense}>
                                {row.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
                              </td>
                              <td style={thtdDense}>
                                {row.writtenOffKg > 0
                                  ? row.writtenOffKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </BirzhaDisclosure>

                {selectedWarehouseStats ? (
                  <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.55rem" }}>
                    Калибров: <strong>{selectedWarehouseStats.calibersCount}</strong>
                    <span className="birzha-text-muted"> · </span>
                    На складе:{" "}
                    <strong>{selectedWarehouseStats.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг</strong>
                    <span className="birzha-text-muted"> · </span>
                    Ящики: <strong>{selectedWarehouseStats.totalPackages.toLocaleString("ru-RU")} ящ.</strong>
                    {selectedWarehouseStats.writtenOffKg > 0 ? (
                      <>
                        <span className="birzha-text-muted"> · </span>
                        В журнале возвратов:{" "}
                        <strong>
                          {selectedWarehouseStats.writtenOffKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг
                        </strong>
                        <span className="birzha-text-muted"> (недоступны к погрузке)</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <BirzhaDisclosure
                  defaultOpen
                  title={
                    <span className="birzha-section-title-inline">
                      Остатки по калибру
                      {selectedWarehouseName ? `: ${selectedWarehouseName}` : ""}
                    </span>
                  }
                >
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
                    На этом складе нет остатка, погрузки, продаж или возвратов по партиям.
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
                          <th style={thHeadDense}>На складе, ящ.</th>
                          <th style={thHeadDense}>Погружено, кг</th>
                          <th style={thHeadDense}>Продано, кг</th>
                          <th style={thHeadDense}>Возвращено, кг</th>
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
                            <td style={thtdDense}>{r.onWarehousePackages.toLocaleString("ru-RU")}</td>
                            <td style={thtdDense}>{r.inTransitKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                            <td style={thtdDense}>{r.soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</td>
                            <td style={thtdDense}>
                              {r.writtenOffKg > 0
                                ? r.writtenOffKg.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                </BirzhaDisclosure>

                {writeOffApiEnabled ? (
                  <BirzhaDisclosure
                    defaultOpen
                    title={
                      <span className="birzha-section-title-inline">
                        Возвраты на склад (журнал)
                        {selectedWarehouseName ? `: ${selectedWarehouseName}` : ""}
                      </span>
                    }
                  >
                    {writeOffsQ.isPending ? (
                      <LoadingBlock label="Загрузка возвратов…" minHeight={48} skeleton skeletonRows={3} />
                    ) : writeOffsQ.isError ? (
                      <ErrorAlert message="Не удалось загрузить журнал возвратов." title="Возвраты" />
                    ) : writeOffLines.length === 0 ? (
                      <p className="birzha-text-muted birzha-ui-sm" role="status">
                        Возвратов с этого склада пока нет. Операция «Вернуть на склад» — в «Погрузка на машину» или разделе «Возврат на склад».
                      </p>
                    ) : (
                      <>
                        <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 0.55rem" }}>
                          Всего в списке:{" "}
                          <strong>{writeOffSumKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг</strong>
                          <span className="birzha-text-muted"> · </span>
                          {writeOffLines.length} опер.
                        </p>
                        <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                          <table style={{ ...tableStyle, minWidth: 560 }}>
                            <thead>
                              <tr>
                                <th style={thHeadDense}>Когда</th>
                                <th style={thHeadDense}>Накладная</th>
                                <th style={thHeadDense}>Калибр</th>
                                <th style={thHeadDense}>Возвращено, кг</th>
                              </tr>
                            </thead>
                            <tbody>
                              {writeOffLines.map((row) => (
                                <tr key={row.id}>
                                  <td style={thtdDense}>{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                                  <td style={thtdDense}>
                                    <Link
                                      to={purchaseNakladnayaDocumentPathForPath(pathname, row.purchaseDocumentId)}
                                      style={{ fontWeight: 600 }}
                                    >
                                      {row.documentNumber?.trim() || "—"}
                                    </Link>
                                  </td>
                                  <td style={thtdDense}>{row.productGradeCode ?? "—"}</td>
                                  <td style={thtdDense}>
                                    {row.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </BirzhaDisclosure>
                ) : null}
              </>
            )}
          </BirzhaDisclosure>
        </>
      ) : null}
    </div>
  );
}
