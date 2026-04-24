import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { apiFetch } from "../api/fetch-api.js";
import type {
  CreateProductGradeResponse,
  CreateWarehouseResponse,
  ProductGradesListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { ops, prefix } from "../routes.js";
import { Link } from "react-router-dom";
import { btnStyle, errorText, fieldStyle, muted, sectionBox, thHeadDense, thtdDense } from "../ui/styles.js";

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

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    void queryClient.invalidateQueries({ queryKey: ["product-grades"] });
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

  if (!enabled) {
    return (
      <section style={sectionBox}>
        <p style={muted}>
          API накладных/справочников недоступен (<code>purchaseDocumentsApi</code>).
        </p>
      </section>
    );
  }

  return (
    <section style={sectionBox} aria-labelledby="inv-adm-heading" role="region">
      <h2 id="inv-adm-heading" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
        Склады и калибры
      </h2>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Управление справочниками. Ввод накладных — в разделе{" "}
        <Link to={ops.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          Накладная
        </Link>{" "}
        ({prefix.operations}).
      </p>

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
