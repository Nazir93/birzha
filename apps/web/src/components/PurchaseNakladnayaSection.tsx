import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/fetch-api.js";
import type {
  CreateProductGradeResponse,
  CreatePurchaseDocumentResponse,
  CreateWarehouseResponse,
  ProductGradesListResponse,
  PurchaseDocumentsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import {
  expectedLineTotalKopecks,
  parseCreatePurchaseDocumentForm,
} from "../validation/api-schemas.js";
import { randomUuid } from "../lib/random-uuid.js";
import { routes } from "../routes.js";
import { btnStyle, errorText, fieldStyle, muted, sectionBox, successText, thHeadDense, thtdDense, warnText } from "../ui/styles.js";

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type LineDraft = {
  key: string;
  productGradeId: string;
  totalKg: string;
  packageCount: string;
  pricePerKg: string;
  lineTotalKopecks: string;
};

function emptyLine(): LineDraft {
  return {
    key: randomUuid(),
    productGradeId: "",
    totalKg: "",
    packageCount: "",
    pricePerKg: "",
    lineTotalKopecks: "",
  };
}

export function PurchaseNakladnayaSection() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";

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

  const listQ = useQuery({
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

  const [documentId, setDocumentId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [docDate, setDocDate] = useState(todayIsoDate);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [buyerLabel, setBuyerLabel] = useState("");
  const [extraCostKopecks, setExtraCostKopecks] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseCode, setNewWarehouseCode] = useState("");
  const [warehouseFormError, setWarehouseFormError] = useState<string | null>(null);
  const [newGradeCode, setNewGradeCode] = useState("");
  const [newGradeDisplayName, setNewGradeDisplayName] = useState("");
  const [newGradeSortOrder, setNewGradeSortOrder] = useState("");
  const [gradeFormError, setGradeFormError] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-documents"] });
  }, [queryClient]);

  const createProductGrade = useMutation({
    mutationFn: async () => {
      setGradeFormError(null);
      const code = newGradeCode.trim();
      const displayName = newGradeDisplayName.trim();
      if (!code || !displayName) {
        throw new Error("Укажите код калибра и подпись (как на накладной)");
      }
      const body: { code: string; displayName: string; sortOrder?: number } = { code, displayName };
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
    onSuccess: (data) => {
      setNewGradeCode("");
      setNewGradeDisplayName("");
      setNewGradeSortOrder("");
      void queryClient.invalidateQueries({ queryKey: ["product-grades"] });
      setLines((prev) =>
        prev.map((line, i) => (i === 0 && !line.productGradeId ? { ...line, productGradeId: data.productGrade.id } : line)),
      );
    },
    onError: (e: Error) => {
      setGradeFormError(e.message);
    },
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
    onSuccess: (data) => {
      setNewWarehouseName("");
      setNewWarehouseCode("");
      setWarehouseId(data.warehouse.id);
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e: Error) => {
      setWarehouseFormError(e.message);
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setLastOk(null);
      const body = parseCreatePurchaseDocumentForm({
        documentId,
        documentNumber,
        docDate,
        warehouseId,
        supplierName,
        buyerLabel,
        extraCostKopecks,
        lines,
      });
      const res = await apiFetch("/api/purchase-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CreatePurchaseDocumentResponse>;
    },
    onSuccess: (data) => {
      setLastOk(`Создан документ: ${data.documentId}`);
      invalidate();
    },
    onError: (e: Error) => {
      setFormError(e.message);
    },
  });

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const fillLineKopecks = (key: string) => {
    const row = lines.find((l) => l.key === key);
    if (!row) {
      return;
    }
    try {
      const kg = Number(row.totalKg.replace(",", "."));
      const rub = Number(row.pricePerKg.replace(",", "."));
      if (!Number.isFinite(kg) || !Number.isFinite(rub) || kg <= 0) {
        return;
      }
      const k = expectedLineTotalKopecks(kg, rub);
      updateLine(key, { lineTotalKopecks: String(k) });
    } catch {
      /* noop */
    }
  };

  const gradeOptions = useMemo(() => {
    const g = gradesQ.data?.productGrades ?? [];
    return g.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru"));
  }, [gradesQ.data]);

  const warehouseCount = warehousesQ.data?.warehouses?.length ?? 0;
  const gradeCount = gradesQ.data?.productGrades?.length ?? 0;
  const catalogsEmptyOk =
    warehousesQ.isSuccess && gradesQ.isSuccess && (warehouseCount === 0 || gradeCount === 0);

  const catalogLoadErrorText = useMemo(() => {
    if (!warehousesQ.isError && !gradesQ.isError) {
      return null;
    }
    const e = warehousesQ.error ?? gradesQ.error;
    const m = e instanceof Error ? e.message : String(e);
    if (/\b401\b/.test(m)) {
      return meta?.requireApiAuth === "enabled" ? (
        <>
          Справочники не загрузились: нужна авторизация. Откройте{" "}
          <Link to={routes.login} style={{ fontWeight: 600 }}>
            Вход
          </Link>
          {user ? " (сессия могла истечь — войдите снова)." : "."}
        </>
      ) : (
        <>Запрос к API вернул 401 — проверьте nginx и прокси <code>/api</code> на сервере.</>
      );
    }
    if (/\b403\b/.test(m)) {
      return <>Доступ запрещён (403). Нужна роль с правом накладной (закупщик, кладовщик, admin и т.д.).</>;
    }
    return <>Не загрузились склады или калибры: {m}</>;
  }, [warehousesQ.isError, warehousesQ.error, gradesQ.isError, gradesQ.error, meta?.requireApiAuth, user]);

  if (!enabled) {
    return (
      <section style={sectionBox} aria-labelledby="nakl-disabled" role="region" aria-label="Закупочная накладная">
        <h3 id="nakl-disabled" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          Закупочная накладная
        </h3>
        <p style={muted}>
          API накладных недоступен: в <code>GET /api/meta</code> сейчас не <code>purchaseDocumentsApi: &quot;enabled&quot;</code>.
          Обычно так бывает без <code>DATABASE_URL</code> на API (в production нужна БД и миграции, в т.ч. закупка) или при неполном контуре на сервере.
          После обновления API в режиме разработки без БД контур поднимается в памяти — перезапустите <code>pnpm dev:api</code>.
        </p>
      </section>
    );
  }

  return (
    <section style={sectionBox} aria-labelledby="nakl-heading" role="region" aria-label="Закупочная накладная">
      <h3 id="nakl-heading" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
        Закупочная накладная (как у заказчика)
      </h3>
      <p style={{ ...muted, marginBottom: "0.5rem" }}>
        <strong>С этого начинается учёт:</strong> по факту приёмки товара на склад внесите те же данные, что на бумажной накладной
        (номер, дата, склад поступления, строки: калибр, кг, короба, цена, сумма). После сохранения по строкам появятся партии на
        выбранном складе.
      </p>
      <p style={muted}>
        POST /api/purchase-documents — одна строка накладной создаёт одну партию на выбранном складе. Сумма строки в копейках
        должна сходиться с кг × цена за кг (допуск ±1 коп. на сервере).
      </p>

      {catalogLoadErrorText && <p style={warnText}>{catalogLoadErrorText}</p>}
      {catalogsEmptyOk && (
        <p role="status" style={warnText}>
          В справочнике нет складов или калибров — нечего выбирать в списках. Добавьте их блоками ниже («Добавить склад», «Добавить
          калибр») или на сервере примените миграции с начальными данными: в каталоге <code>apps/api</code> выполните{" "}
          <code>pnpm db:migrate</code> (один раз; не только <code>db:push</code>).
        </p>
      )}
      {(warehousesQ.isPending || gradesQ.isPending) && <p style={muted}>Загрузка справочников складов и калибров…</p>}
      {listQ.isError && (
        <p role="alert" style={errorText}>
          Список накладных не загрузился: {listQ.error instanceof Error ? listQ.error.message : String(listQ.error)}
        </p>
      )}

      <div style={{ display: "grid", gap: "0.5rem", maxWidth: 520, marginBottom: "0.75rem" }}>
        <label style={{ fontSize: "0.88rem" }}>
          Номер документа *
          <input
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            style={fieldStyle}
            placeholder="НФ-100"
            autoComplete="off"
          />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Дата (YYYY-MM-DD) *
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Склад *
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{ ...fieldStyle, maxWidth: "100%" }}
          >
            <option value="">— выберите —</option>
            {(warehousesQ.data?.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: "0.85rem" }}>
          <p style={{ ...muted, margin: "0 0 0.35rem" }}>Нет нужного склада — добавьте (название как на бумаге; код — латиница, опционально)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            <input
              value={newWarehouseName}
              onChange={(e) => setNewWarehouseName(e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 160px", minWidth: 120 }}
              placeholder="Название склада"
              autoComplete="off"
              aria-label="Название нового склада"
            />
            <input
              value={newWarehouseCode}
              onChange={(e) => setNewWarehouseCode(e.target.value)}
              style={{ ...fieldStyle, width: 120 }}
              placeholder="Код (опц.)"
              autoComplete="off"
              aria-label="Код склада латиницей, опционально"
            />
            <button
              type="button"
              style={btnStyle}
              disabled={createWarehouse.isPending}
              onClick={() => void createWarehouse.mutate()}
            >
              {createWarehouse.isPending ? "…" : "Добавить склад"}
            </button>
          </div>
          {warehouseFormError && (
            <p role="alert" style={{ ...errorText, margin: "0.35rem 0 0" }}>
              {warehouseFormError}
            </p>
          )}
        </div>
        <label style={{ fontSize: "0.88rem" }}>
          ID документа (опц., иначе UUID на сервере)
          <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} style={fieldStyle} placeholder="" />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Поставщик (опц.)
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Покупатель / подпись (опц.)
          <input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Доп. расходы, коп.
          <input value={extraCostKopecks} onChange={(e) => setExtraCostKopecks(e.target.value)} style={fieldStyle} />
        </label>
      </div>

      <p style={{ ...muted, margin: "0 0 0.35rem" }}>Строки</p>
      {!gradesQ.isPending && gradeOptions.length === 0 && !gradesQ.isError && (
        <p role="status" style={warnText}>
          В справочнике нет калибров — добавьте строку ниже (код как на бумажной накладной, например №5 или НС−).
        </p>
      )}
      <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <p style={{ ...muted, margin: "0 0 0.35rem" }}>Нет нужного калибра — добавьте в справочник</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
          <input
            value={newGradeCode}
            onChange={(e) => setNewGradeCode(e.target.value)}
            style={{ ...fieldStyle, width: 88 }}
            placeholder="Код"
            autoComplete="off"
            aria-label="Код калибра"
          />
          <input
            value={newGradeDisplayName}
            onChange={(e) => setNewGradeDisplayName(e.target.value)}
            style={{ ...fieldStyle, flex: "1 1 140px", minWidth: 120 }}
            placeholder="Подпись в списке"
            autoComplete="off"
            aria-label="Название калибра"
          />
          <input
            value={newGradeSortOrder}
            onChange={(e) => setNewGradeSortOrder(e.target.value)}
            style={{ ...fieldStyle, width: 72 }}
            placeholder="Порядок"
            autoComplete="off"
            inputMode="numeric"
            aria-label="Порядок сортировки, опционально"
          />
          <button
            type="button"
            style={btnStyle}
            disabled={createProductGrade.isPending || gradesQ.isPending}
            onClick={() => void createProductGrade.mutate()}
          >
            {createProductGrade.isPending ? "…" : "Добавить калибр"}
          </button>
        </div>
        {gradeFormError && (
          <p role="alert" style={{ ...errorText, margin: "0.35rem 0 0" }}>
            {gradeFormError}
          </p>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Калибр</th>
              <th style={thHeadDense}>Кг</th>
              <th style={thHeadDense}>Короба</th>
              <th style={thHeadDense}>₽/кг</th>
              <th style={thHeadDense}>Сумма, коп.</th>
              <th style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td style={thtdDense}>
                  <select
                    value={line.productGradeId}
                    onChange={(e) => updateLine(line.key, { productGradeId: e.target.value })}
                    style={{ ...fieldStyle, minWidth: 160, fontSize: "0.82rem" }}
                    disabled={gradesQ.isPending}
                  >
                    <option value="">{gradesQ.isPending ? "Загрузка…" : "— выберите —"}</option>
                    {gradeOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} — {g.displayName}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.totalKg}
                    onChange={(e) => updateLine(line.key, { totalKg: e.target.value })}
                    style={{ ...fieldStyle, width: 72 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.packageCount}
                    onChange={(e) => updateLine(line.key, { packageCount: e.target.value })}
                    style={{ ...fieldStyle, width: 56 }}
                    inputMode="numeric"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.pricePerKg}
                    onChange={(e) => updateLine(line.key, { pricePerKg: e.target.value })}
                    style={{ ...fieldStyle, width: 72 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.lineTotalKopecks}
                    onChange={(e) => updateLine(line.key, { lineTotalKopecks: e.target.value })}
                    style={{ ...fieldStyle, width: 88 }}
                    inputMode="numeric"
                  />
                </td>
                <td style={thtdDense}>
                  <button type="button" style={{ ...btnStyle, fontSize: "0.78rem" }} onClick={() => fillLineKopecks(line.key)}>
                    =кг×цена
                  </button>
                  <button
                    type="button"
                    style={{ ...btnStyle, fontSize: "0.78rem", marginLeft: 4 }}
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "0.5rem 0" }}>
        <button type="button" style={btnStyle} onClick={addLine}>
          Добавить строку
        </button>
        <button
          type="button"
          style={{ ...btnStyle, marginLeft: 8 }}
          onClick={() => void submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending ? "Отправка…" : "Создать накладную"}
        </button>
      </p>

      {formError && (
        <p role="alert" style={errorText}>
          {formError}
        </p>
      )}
      {lastOk && <p style={successText}>{lastOk}</p>}

      {listQ.data && listQ.data.purchaseDocuments.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ ...muted, marginBottom: "0.35rem" }}>Последние накладные (GET /api/purchase-documents)</p>
          <table style={{ borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={thHeadDense}>Номер</th>
                <th style={thHeadDense}>Дата</th>
                <th style={thHeadDense}>Склад</th>
                <th style={thHeadDense}>Строк</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.purchaseDocuments.slice(0, 12).map((d) => (
                <tr key={d.id}>
                  <td style={thtdDense}>
                    <code>{d.documentNumber}</code>
                  </td>
                  <td style={thtdDense}>{d.docDate}</td>
                  <td style={thtdDense}>
                    <code style={{ fontSize: "0.75rem" }}>{d.warehouseId}</code>
                  </td>
                  <td style={thtdDense}>{d.lineCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
