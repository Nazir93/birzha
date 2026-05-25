import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import {
  purchaseDocumentDetailQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { useAuth } from "../auth/auth-context.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { kopecksToRubLabel } from "../format/money.js";
import { purchaseNakladnayaBasePathForPath } from "../routes.js";
import { linePackageCountForNakladnayaSum, lineTotalKopecksForNakladnayaSum } from "../validation/api-schemas.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { thHeadDense, thtdDense } from "../ui/styles.js";

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
      <InfoAlert title="Раздел недоступен">
        Раздел накладных временно недоступен. Обратитесь к администратору.
      </InfoAlert>
    );
  }

  if (!id) {
    return <ErrorAlert message="Не удалось открыть накладную." />;
  }

  if (docQ.isPending) {
    return <LoadingBlock label="Загрузка накладной…" minHeight={100} skeleton skeletonRows={6} />;
  }

  if (docQ.isError) {
    return <ErrorAlert error={docQ.error} title="Накладная" />;
  }

  const doc = docQ.data;
  if (!doc) {
    return (
      <div className="birzha-panel">
        <ErrorAlert message="Документ не найден." />
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
    <section
      className="birzha-panel birzha-purchase-nakl-print"
      aria-labelledby="nakl-detail-heading"
      role="region"
    >
      <BirzhaDisclosure
        defaultOpen
        title={
          <h3 id="nakl-detail-heading" style={{ margin: 0, fontSize: "1rem" }}>
            Накладная · <strong>{doc.supplierName?.trim() || doc.documentNumber}</strong>
            <span className="birzha-text-muted birzha-ui-sm" style={{ marginLeft: "0.5rem", fontWeight: 500 }}>
              {formatPurchaseDocDateRu(doc.docDate)}
            </span>
          </h3>
        }
      >
      <div
        className="no-print"
        style={{
          marginBottom: "0.5rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.5rem 0.75rem",
        }}
      >
        <Link to={listPath} className="birzha-ui-sm">
          ← Все закупки товара
        </Link>
        <button
          type="button"
          className="birzha-btn-ghost"
          title="Откроется окно печати браузера; выберите «Сохранить как PDF», если нужен файл."
          onClick={() => {
            globalThis.window?.print();
          }}
        >
          Печать / PDF
        </button>
      </div>

      <div className="birzha-nakl-detail-meta">
        <div>
          <strong>Склад:</strong>{" "}
          {warehousesQ.isPending ? (
            <LoadingIndicator size="sm" label="Загрузка склада…" />
          ) : warehousesQ.isError ? (
            <span className="birzha-text-muted">склад не загрузился</span>
          ) : (
            warehouseLabel(doc.warehouseId)
          )}
        </div>
        {doc.buyerLabel && (
          <div>
            <strong>Покупатель / подпись:</strong> {doc.buyerLabel}
          </div>
        )}
        {totals && totals.extraKop > 0 && (
          <div>
            <strong>Доп. расходы:</strong> {kopecksToRubLabel(String(doc.extraCostKopecks))} ₽
          </div>
        )}
      </div>

      <p className="birzha-nakl-lines-heading">Строки (каждая строка — партия)</p>
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
        <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
          <thead>
            <tr>
              <th style={thHeadDense}>№</th>
              <th style={thHeadDense}>Калибр</th>
              <th style={thHeadDense}>Кг</th>
              <th style={thHeadDense}>Короба</th>
              <th style={thHeadDense}>₽/кг</th>
              <th style={thHeadDense}>Сумма, ₽</th>
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
                <td style={thtdDense}>{kopecksToRubLabel(String(line.lineTotalKopecks))} ₽</td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="birzha-table-subtotal-row">
                <th
                  colSpan={2}
                  scope="row"
                  style={{ ...thtdDense, textAlign: "right" }}
                >
                  {totals.extraKop > 0 ? "Итого по строкам" : "Всего по документу"}
                </th>
                <td
                  style={{ ...thtdDense, fontWeight: 600 }}
                  title="Сумма кг по строкам"
                >
                  {totalKgLabel}{" "}
                  <span className="birzha-text-muted birzha-text-muted--sm">
                    кг
                  </span>
                </td>
                <td style={{ ...thtdDense, fontWeight: 600 }}>
                  {new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 }).format(
                    totals.totalPackages,
                  )}{" "}
                  <span className="birzha-text-muted birzha-text-muted--sm">
                    кор.
                  </span>
                </td>
                <td className="birzha-text-muted" style={{ ...thtdDense }}>
                  —
                </td>
                <td style={{ ...thtdDense, fontWeight: totals.extraKop > 0 ? 600 : 700, fontSize: totals.extraKop > 0 ? undefined : "0.95rem" }}>
                  {kopecksToRubLabel(totals.lineKopSum.toString())} ₽
                </td>
              </tr>
              {totals.extraKop > 0 && (
                <tr className="birzha-table-subtotal-row">
                  <th
                    colSpan={5}
                    scope="row"
                    style={{ ...thtdDense, textAlign: "right" }}
                  >
                    Доп. расходы (см. шапку)
                  </th>
                  <td style={thtdDense}>{kopecksToRubLabel(totals.extraKop.toString())} ₽</td>
                </tr>
              )}
              {totals.extraKop > 0 && (
                <tr className="birzha-table-subtotal-row birzha-table-subtotal-row--emphasis">
                  <th
                    colSpan={5}
                    scope="row"
                    style={{ ...thtdDense, textAlign: "right" }}
                  >
                    Всего по документу
                  </th>
                  <td style={{ ...thtdDense, fontWeight: 700, fontSize: "0.95rem" }}>
                    {kopecksToRubLabel(totals.allKop.toString())} ₽
                  </td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>

      </BirzhaDisclosure>
    </section>
  );
}
