import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { apiFetch } from "../api/fetch-api.js";
import type { PurchaseDocumentDetail, WarehousesListResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { routes, purchaseNakladnayaDocumentPath } from "../routes.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, sectionBox, thHeadDense, thtdDense } from "../ui/styles.js";

function formatRubFromKopecks(k: string): string {
  const n = BigInt(k);
  const rub = n / 100n;
  const kop = n % 100n;
  return `${rub.toString()},${kop.toString().padStart(2, "0")}`;
}

export function PurchaseNakladnayaDetailSection() {
  const { documentId } = useParams<{ documentId: string }>();
  const { meta } = useAuth();
  const enabled = meta?.purchaseDocumentsApi === "enabled";
  const id = documentId ? decodeURIComponent(documentId) : "";

  const warehousesQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await apiFetch("/api/warehouses");
      if (!res.ok) {
        throw new Error(`warehouses ${res.status}`);
      }
      return res.json() as Promise<WarehousesListResponse>;
    },
    enabled: enabled && Boolean(id),
  });

  const docQ = useQuery({
    queryKey: ["purchase-document", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/purchase-documents/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`purchase-documents/${id} ${res.status}`);
      }
      return res.json() as Promise<PurchaseDocumentDetail>;
    },
    enabled: enabled && Boolean(id),
  });

  const warehouseLabel = (wid: string) => {
    const w = warehousesQ.data?.warehouses.find((x) => x.id === wid);
    return w ? `${w.name} (${w.code})` : wid;
  };

  if (!enabled) {
    return (
      <p style={muted}>
        API накладных недоступен (<code>purchaseDocumentsApi</code>).
      </p>
    );
  }

  if (!id) {
    return <p style={errorText}>Не указан ID документа.</p>;
  }

  if (docQ.isPending) {
    return <LoadingBlock label="Загрузка накладной (GET /api/purchase-documents/…)…" minHeight={100} />;
  }

  if (docQ.isError) {
    return (
      <p role="alert" style={errorText}>
        {docQ.error instanceof Error ? docQ.error.message : String(docQ.error)}
      </p>
    );
  }

  const doc = docQ.data;
  if (!doc) {
    return (
      <div style={sectionBox}>
        <p style={errorText}>Документ не найден.</p>
        <Link to={routes.purchaseNakladnaya} style={{ fontSize: "0.92rem" }}>
          ← Назад к новой накладной
        </Link>
      </div>
    );
  }

  return (
    <section style={sectionBox} aria-labelledby="nakl-detail-heading" role="region">
      <div style={{ marginBottom: "0.5rem" }}>
        <Link to={routes.purchaseNakladnaya} style={{ fontSize: "0.88rem" }}>
          ← Все накладные и новая
        </Link>
      </div>
      <h3 id="nakl-detail-heading" style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
        Накладная <strong>{doc.documentNumber}</strong>
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        ID документа: <code style={{ fontSize: "0.82rem" }}>{doc.id}</code>
        {doc.createdAt && (
          <>
            {" "}
            · создана: {new Date(doc.createdAt).toLocaleString("ru-RU")}
          </>
        )}
      </p>

      <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.88rem", marginBottom: "0.75rem", maxWidth: 520 }}>
        <div>
          <strong>Дата:</strong> {doc.docDate}
        </div>
        <div>
          <strong>Склад:</strong>{" "}
          {warehousesQ.isPending ? (
            <span style={muted}>…</span>
          ) : warehousesQ.isError ? (
            <code style={{ fontSize: "0.82rem" }}>{doc.warehouseId}</code>
          ) : (
            warehouseLabel(doc.warehouseId)
          )}
        </div>
        {doc.supplierName && (
          <div>
            <strong>Поставщик:</strong> {doc.supplierName}
          </div>
        )}
        {doc.buyerLabel && (
          <div>
            <strong>Покупатель / подпись:</strong> {doc.buyerLabel}
          </div>
        )}
        <div>
          <strong>Доп. расходы:</strong> {doc.extraCostKopecks} коп. (
          {formatRubFromKopecks(doc.extraCostKopecks)} ₽)
        </div>
      </div>

      <p style={{ ...muted, margin: "0 0 0.35rem" }}>Строки (каждая строка — партия)</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
          <thead>
            <tr>
              <th style={thHeadDense}>№</th>
              <th style={thHeadDense}>Калибр</th>
              <th style={thHeadDense}>Кг</th>
              <th style={thHeadDense}>Короба</th>
              <th style={thHeadDense}>₽/кг</th>
              <th style={thHeadDense}>Сумма, коп.</th>
              <th style={thHeadDense}>Партия (batch)</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={`${line.lineNo}-${line.batchId}`}>
                <td style={thtdDense}>{line.lineNo}</td>
                <td style={thtdDense}>{line.productGradeCode}</td>
                <td style={thtdDense}>{line.totalKg}</td>
                <td style={thtdDense}>{line.packageCount ?? "—"}</td>
                <td style={thtdDense}>{line.pricePerKg}</td>
                <td style={thtdDense}>{line.lineTotalKopecks}</td>
                <td style={thtdDense}>
                  <code style={{ fontSize: "0.75rem" }}>{line.batchId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...muted, marginTop: "0.75rem", fontSize: "0.82rem" }}>
        Прямая ссылка:{" "}
        <code style={{ wordBreak: "break-all" }}>{purchaseNakladnayaDocumentPath(doc.id)}</code>
      </p>
    </section>
  );
}
