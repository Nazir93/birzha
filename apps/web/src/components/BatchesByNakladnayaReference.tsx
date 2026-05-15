import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { formatNakladLineLabel } from "../format/batch-label.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { totalsByGradeFromNakladnayaBatches } from "../format/purchase-nakladnaya-totals-by-grade.js";
import { purchaseDocumentsFullListQueryOptions } from "../query/core-list-queries.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaSkeletonPanel } from "../ui/BirzhaSkeleton.js";
import { btnStyleInline, tableStyleDense, thHeadDense, thtdDense } from "../ui/styles.js";

export type BatchesNaklGroup = {
  documentId: string;
  documentNumber: string | null;
  batches: BatchListItem[];
};

export function groupBatchesByPurchaseDocument(
  allBatches: readonly BatchListItem[] | undefined,
): BatchesNaklGroup[] {
  if (!allBatches?.length) {
    return [];
  }
  const list = allBatches.filter(isFromPurchaseNakladnaya);
  const byDoc = new Map<string, BatchListItem[]>();
  for (const b of list) {
    const did = b.nakladnaya?.documentId;
    if (!did) {
      continue;
    }
    if (!byDoc.has(did)) {
      byDoc.set(did, []);
    }
    byDoc.get(did)!.push(b);
  }
  const groups: BatchesNaklGroup[] = [];
  for (const [documentId, batches] of byDoc) {
    const documentNumber = batches[0]?.nakladnaya?.documentNumber ?? null;
    batches.sort(
      (a, c) =>
        (a.nakladnaya?.productGradeCode ?? "").localeCompare(c.nakladnaya?.productGradeCode ?? "", "ru") ||
        a.id.localeCompare(c.id),
    );
    groups.push({ documentId, documentNumber, batches });
  }
  groups.sort((a, b) =>
    (a.documentNumber ?? "").localeCompare(b.documentNumber ?? "", "ru", { numeric: true }),
  );
  return groups;
}

type Props = {
  /** Полный ответ `GET /api/batches` — группировка внутри. */
  batches: readonly BatchListItem[] | undefined;
  /** Пока грузим — пусто или скелет. */
  isLoading?: boolean;
  /** `id` для подписи секции (aria). */
  sectionHeadingId: string;
  /** Кнопки «развернуть/свернуть все» (удобно в админке при большом числе накладных). */
  showBulkExpandControls?: boolean;
};

/**
 * Справочная таблица партий по накладным. Каждая накладная — **раскрываемый** блок, чтобы длинный список не занимал
 * экран целиком. Одна накладная: блок открыт по умолчанию; несколько — **свёрнуты** до клика.
 */
export function BatchesByNakladnayaReference({
  batches,
  isLoading = false,
  sectionHeadingId,
  showBulkExpandControls = false,
}: Props) {
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const purchaseDocsEnabled = meta?.purchaseDocumentsApi === "enabled";
  const purchaseDocsQuery = useQuery({
    ...purchaseDocumentsFullListQueryOptions(),
    enabled: purchaseDocsEnabled,
  });
  const docDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of purchaseDocsQuery.data?.purchaseDocuments ?? []) {
      m.set(d.id, d.docDate);
    }
    return m;
  }, [purchaseDocsQuery.data?.purchaseDocuments]);

  const groups = useMemo(() => groupBatchesByPurchaseDocument(batches), [batches]);
  const gKey = useMemo(() => groups.map((x) => x.documentId).join("|"), [groups]);
  const [openByDoc, setOpenByDoc] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenByDoc((prev) => {
      const n: Record<string, boolean> = {};
      for (const g of groups) {
        const ex = prev[g.documentId];
        n[g.documentId] = ex !== undefined ? ex : groups.length === 1;
      }
      return n;
    });
  }, [gKey, groups]);

  if (isLoading) {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <BirzhaSkeletonPanel label="Загрузка партий…" rows={4} minHeight={72} />
      </div>
    );
  }
  if (!batches) {
    return null;
  }
  if (groups.length === 0) {
    return (
      <div className="birzha-batches-nakl-ref" style={{ marginBottom: "1rem" }}>
        <p id={sectionHeadingId} className="birzha-callout-info" style={{ marginBottom: "0.5rem" }}>
          <strong>Партии по накладным</strong> — по номеру накладной, дате документа и калибру. Раскройте блок, чтобы увидеть
          строки. Без оформленной накладной партии в список не попадают.
        </p>
        <BirzhaEmptyState
          compact
          title="Нет партий по накладным"
          description="Без оформленной закупки товар в этот список не попадает — проверьте данные или оформите приём в закупке."
        />
      </div>
    );
  }

  const setAll = (v: boolean) => {
    setOpenByDoc(Object.fromEntries(groups.map((g) => [g.documentId, v])));
  };

  return (
    <div
      style={{ marginBottom: "1rem" }}
      className="birzha-batches-nakl-ref"
    >
      <p id={sectionHeadingId} className="birzha-callout-info" style={{ marginBottom: "0.5rem" }}>
        <strong>Партии по накладным</strong> — по номеру накладной, дате документа и калибру. Раскройте блок, чтобы увидеть
        строки. Без оформленной накладной партии в список не попадают.
      </p>
      {showBulkExpandControls && groups.length > 1 && (
        <p className="no-print" style={{ margin: "0 0 0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <button type="button" style={btnStyleInline} onClick={() => setAll(true)}>
            Развернуть все
          </button>
          <button type="button" style={btnStyleInline} onClick={() => setAll(false)}>
            Свернуть все
          </button>
        </p>
      )}
      {groups.map((grp) => {
        const nLines = grp.batches.length;
        const gradeTotals = totalsByGradeFromNakladnayaBatches(grp.batches);
        const grandTotals = grp.batches.reduce(
          (a, b) => ({
            onWarehouseKg: a.onWarehouseKg + b.onWarehouseKg,
            inTransitKg: a.inTransitKg + b.inTransitKg,
            soldKg: a.soldKg + b.soldKg,
            pendingInboundKg: a.pendingInboundKg + b.pendingInboundKg,
          }),
          { onWarehouseKg: 0, inTransitKg: 0, soldKg: 0, pendingInboundKg: 0 },
        );
        const rawDocDate = docDateById.get(grp.documentId);
        const docDateLabel =
          rawDocDate != null && rawDocDate !== ""
            ? formatPurchaseDocDateRu(rawDocDate)
            : purchaseDocsQuery.isPending
              ? "…"
              : null;
        const isOpen = openByDoc[grp.documentId] ?? false;
        return (
          <BirzhaDisclosure
            key={grp.documentId}
            className="birzha-nakl-details"
            summaryClassName="birzha-nakl-details__summary"
            bodyClassName="birzha-nakl-details__body birzha-table-scroll birzha-table-scroll--sticky-head"
            bodyStyle={{ padding: "0 0 0.75rem" }}
            open={isOpen}
            onOpenChange={(next) => setOpenByDoc((p) => ({ ...p, [grp.documentId]: next }))}
            title={
              <>
                <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                  Накладная № {grp.documentNumber ?? "—"}
                  {docDateLabel != null ? (
                    <>
                      {" "}
                      <span style={{ fontWeight: 600 }}>· {docDateLabel}</span>
                    </>
                  ) : null}{" "}
                  <span className="birzha-text-muted birzha-text-muted--lg" style={{ fontWeight: 500 }}>
                    (строк: {nLines})
                  </span>
                </span>{" "}
                <span className="birzha-ui-sm" style={{ fontWeight: 400 }}>
                  <Link
                    to={purchaseNakladnayaDocumentPathForPath(pathname, grp.documentId)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                    }}
                  >
                    открыть документ
                  </Link>
                </span>
              </>
            }
          >
            <table
              style={tableStyleDense}
              aria-label={`Партии по накладной ${grp.documentNumber ?? grp.documentId}`}
            >
              <thead>
                <tr>
                  <th scope="col" style={thHeadDense}>
                    Товар / калибр
                  </th>
                  <th scope="col" style={thHeadDense}>
                    на складе, кг
                  </th>
                  <th scope="col" style={thHeadDense}>
                    на рейсе, кг
                  </th>
                  <th scope="col" style={thHeadDense}>
                    продано
                  </th>
                  <th scope="col" style={thHeadDense}>
                    ожидает приёмки
                  </th>
                </tr>
              </thead>
              <tbody>
                {grp.batches.map((b) => (
                  <tr key={b.id} title={`Технический id партии (поддержка): ${b.id}`}>
                    <td style={thtdDense}>{formatNakladLineLabel(b)}</td>
                    <td style={thtdDense}>{b.onWarehouseKg}</td>
                    <td style={thtdDense}>{b.inTransitKg}</td>
                    <td style={thtdDense}>{b.soldKg}</td>
                    <td style={thtdDense}>{b.pendingInboundKg}</td>
                  </tr>
                ))}
                {gradeTotals.map((row) => (
                  <tr
                    key={`g-${grp.documentId}-${row.gradeCode}`}
                    style={{ background: "rgba(0,0,0,0.04)", fontWeight: 600 }}
                  >
                    <td style={thtdDense}>
                      {row.gradeCode}{" "}
                      <span className="birzha-text-muted" style={{ fontWeight: 500, fontSize: "0.78rem" }}>
                        итого по калибру
                      </span>
                    </td>
                    <td style={thtdDense}>{row.onWarehouseKg}</td>
                    <td style={thtdDense}>{row.inTransitKg}</td>
                    <td style={thtdDense}>{row.soldKg}</td>
                    <td style={thtdDense}>{row.pendingInboundKg}</td>
                  </tr>
                ))}
                <tr style={{ background: "rgba(0,0,0,0.06)", fontWeight: 700 }}>
                  <td style={thtdDense}>Всего по накладной</td>
                  <td style={thtdDense}>{grandTotals.onWarehouseKg}</td>
                  <td style={thtdDense}>{grandTotals.inTransitKg}</td>
                  <td style={thtdDense}>{grandTotals.soldKg}</td>
                  <td style={thtdDense}>{grandTotals.pendingInboundKg}</td>
                </tr>
              </tbody>
            </table>
          </BirzhaDisclosure>
        );
      })}
    </div>
  );
}
