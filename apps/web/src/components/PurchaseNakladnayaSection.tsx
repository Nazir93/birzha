import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { apiFetch } from "../api/fetch-api.js";
import type {
  CreatePurchaseDocumentResponse,
  ProductGradesListResponse,
  PurchaseDocumentsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import {
  expectedLineTotalKopecks,
  parseCreatePurchaseDocumentForm,
} from "../validation/api-schemas.js";
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
    key: crypto.randomUUID(),
    productGradeId: "",
    totalKg: "",
    packageCount: "",
    pricePerKg: "",
    lineTotalKopecks: "",
  };
}

export function PurchaseNakladnayaSection() {
  const { meta } = useAuth();
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

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-documents"] });
  }, [queryClient]);

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

  if (!enabled) {
    return (
      <section style={sectionBox} aria-labelledby="nakl-disabled" role="region" aria-label="Закупочная накладная">
        <h3 id="nakl-disabled" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          Закупочная накладная
        </h3>
        <p style={muted}>
          API накладных недоступен: на сервере нужен полный контур (партии, рейсы, sync) и миграция БД с таблицами закупки.
          В <code>GET /api/meta</code> должно быть <code>purchaseDocumentsApi: &quot;enabled&quot;</code>.
        </p>
      </section>
    );
  }

  return (
    <section style={sectionBox} aria-labelledby="nakl-heading" role="region" aria-label="Закупочная накладная">
      <h3 id="nakl-heading" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
        Закупочная накладная (как у заказчика)
      </h3>
      <p style={muted}>
        POST /api/purchase-documents — одна строка накладной создаёт одну партию на выбранном складе. Сумма строки в копейках
        должна сходиться с кг × цена за кг (допуск ±1 коп. на сервере).
      </p>

      {(warehousesQ.isError || gradesQ.isError) && (
        <p style={warnText}>Не загрузились справочники складов или калибров — проверьте API и миграции.</p>
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
                    style={{ ...fieldStyle, minWidth: 120, fontSize: "0.82rem" }}
                  >
                    <option value="">—</option>
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
