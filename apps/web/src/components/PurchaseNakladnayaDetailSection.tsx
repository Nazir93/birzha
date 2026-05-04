import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import {
  purchaseDocumentDetailQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { kopecksToRubLabel } from "../format/money.js";
import {
  purchaseNakladnayaBasePathForPath,
  purchaseNakladnayaDocumentPathForPath,
} from "../routes.js";
import { linePackageCountForNakladnayaSum, lineTotalKopecksForNakladnayaSum } from "../validation/api-schemas.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { errorText, muted, thHeadDense, thtdDense } from "../ui/styles.js";

function formatRubFromKopecks(k: string): string {
  const n = BigInt(k);
  const rub = n / 100n;
  const kop = n % 100n;
  return `${rub.toString()},${kop.toString().padStart(2, "0")}`;
}

export function PurchaseNakladnayaDetailSection() {
  const { documentId } = useParams<{ documentId: string }>();
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const listPath = purchaseNakladnayaBasePathForPath(pathname);
  const enabled = meta?.purchaseDocumentsApi === "enabled";
  const id = documentId ? decodeURIComponent(documentId) : "";

  const warehousesQ = useQuery({
    ...warehousesFullListQueryOptions(),
    enabled: enabled && Boolean(id),
  });

  const docQ = useQuery({
    ...purchaseDocumentDetailQueryOptions(id),
    enabled: enabled && Boolean(id),
  });

  const documentTotals = useMemo(() => {
    const d = docQ.data;
    if (!d) {
      return null;
    }
    let totalKg = 0;
    let totalPackages = 0;
    let lineKopSum = 0;
    for (const line of d.lines) {
      totalKg += line.totalKg;
      totalPackages += linePackageCountForNakladnayaSum(line.packageCount ?? "");
      lineKopSum += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    }
    const extraKop = lineTotalKopecksForNakladnayaSum(d.extraCostKopecks);
    const allKop = lineKopSum + extraKop;
    return { totalKg, totalPackages, lineKopSum, extraKop, allKop };
  }, [docQ.data]);

  const warehouseLabel = (wid: string) => {
    const w = warehousesQ.data?.warehouses.find((x) => x.id === wid);
    return w ? `${w.name} (${w.code})` : wid;
  };

  if (!enabled) {
    return (
      <p style={muted}>
        Раздел накладных временно недоступен. Обратитесь к администратору.
      </p>
    );
  }

  if (!id) {
    return <p style={errorText}>Не указан ID документа.</p>;
  }

  if (docQ.isPending) {
    return <LoadingBlock label="Загрузка накладной…" minHeight={100} />;
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
      <div className="birzha-panel">
        <p style={errorText}>Документ не найден.</p>
        <Link to={listPath} style={{ fontSize: "0.92rem" }}>
          ← Назад к закупке товара
        </Link>
      </div>
    );
  }

  const totals = documentTotals;
  const totalKgLabel = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6, useGrouping: true }).format(
    totals?.totalKg ?? 0,
  );

  return (
    <section className="birzha-panel" aria-labelledby="nakl-detail-heading" role="region">
      <div style={{ marginBottom: "0.5rem" }}>
        <Link to={listPath} style={{ fontSize: "0.88rem" }}>
          ← Все закупки товара
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

      <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.88rem", marginBottom: "0.75rem", width: "100%", maxWidth: "100%" }}>
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
          {totals && (
            <tfoot>
              <tr>
                <th
                  colSpan={2}
                  scope="row"
                  style={{ ...thtdDense, textAlign: "right", background: "rgba(0,0,0,0.04)" }}
                >
                  Итого
                </th>
                <td
                  style={{ ...thtdDense, fontWeight: 600, background: "rgba(0,0,0,0.04)" }}
                  title="Сумма кг по строкам"
                >
                  {totalKgLabel}{" "}
                  <span className="birzha-text-muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
                    кг
                  </span>
                </td>
                <td style={{ ...thtdDense, fontWeight: 600, background: "rgba(0,0,0,0.04)" }}>
                  {new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 }).format(
                    totals.totalPackages,
                  )}{" "}
                  <span className="birzha-text-muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
                    кор.
                  </span>
                </td>
                <td className="birzha-text-muted" style={{ ...thtdDense, background: "rgba(0,0,0,0.04)" }}>
                  —
                </td>
                <td style={{ ...thtdDense, background: "rgba(0,0,0,0.04)" }}>
                  <div style={{ fontWeight: 600 }}>{totals.lineKopSum} коп.</div>
                  <div className="birzha-text-subtle" style={{ fontSize: "0.8rem" }}>
                    = {kopecksToRubLabel(totals.lineKopSum.toString())} ₽
                  </div>
                </td>
                <td style={{ ...thtdDense, background: "rgba(0,0,0,0.04)" }}>—</td>
              </tr>
              {totals.extraKop > 0 && (
                <tr>
                  <th
                    colSpan={5}
                    scope="row"
                    style={{ ...thtdDense, textAlign: "right", background: "rgba(0,0,0,0.03)" }}
                  >
                    Доп. расходы (см. шапку)
                  </th>
                  <td colSpan={2} style={{ ...thtdDense, background: "rgba(0,0,0,0.03)" }}>
                    <span style={{ fontWeight: 600 }}>{totals.extraKop} коп.</span> = {kopecksToRubLabel(totals.extraKop.toString())} ₽
                  </td>
                </tr>
              )}
              <tr>
                <th
                  colSpan={5}
                  scope="row"
                  style={{ ...thtdDense, textAlign: "right", background: "rgba(0,0,0,0.05)", fontWeight: 700 }}
                >
                  Всего по документу
                </th>
                <td colSpan={2} style={{ ...thtdDense, background: "rgba(0,0,0,0.05)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{totals.allKop} коп.</div>
                  <div style={{ fontSize: "0.9rem" }}>= {kopecksToRubLabel(totals.allKop.toString())} ₽</div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totals && (
        <div
          className="birzha-inline-panel"
          role="region"
          aria-label="Итого по накладной"
          style={{ marginTop: "0.75rem", marginBottom: 0, maxWidth: "100%", fontSize: "0.9rem", lineHeight: 1.5 }}
        >
          <h4 id="nakl-totals-heading" className="birzha-section-title birzha-section-title--sm">
            Итого
          </h4>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Кг</strong> по всем строкам: {totalKgLabel} кг
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Короба / ящики</strong> (сумма по строкам): {totals.totalPackages.toLocaleString("ru-RU")} шт.
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Сумма по строкам:</strong> {totals.lineKopSum} коп. = {kopecksToRubLabel(totals.lineKopSum.toString())} ₽
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Доп. расходы</strong> (к документу): {totals.extraKop} коп. = {kopecksToRubLabel(totals.extraKop.toString())} ₽
            {totals.extraKop === 0 && <span style={muted}>, не указаны</span>}
          </p>
          <p className="birzha-divider-top">
            <strong style={{ fontSize: "1.02rem" }}>К оплате (всего):</strong> {totals.allKop} коп. = {kopecksToRubLabel(totals.allKop.toString())} ₽
          </p>
        </div>
      )}

      <p style={{ ...muted, marginTop: "0.75rem", fontSize: "0.82rem" }}>
        Прямая ссылка:{" "}
        <code style={{ wordBreak: "break-all" }}>{purchaseNakladnayaDocumentPathForPath(pathname, doc.id)}</code>
      </p>
    </section>
  );
}
