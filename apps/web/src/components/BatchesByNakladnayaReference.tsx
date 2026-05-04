import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { btnStyleInline, muted, tableStyleDense, thHeadDense, thtdDense } from "../ui/styles.js";

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
    return <p style={muted} role="status" aria-live="polite">Загрузка партий…</p>;
  }
  if (!batches) {
    return null;
  }
  if (groups.length === 0) {
    return (
      <div className="birzha-batches-nakl-ref" style={{ marginBottom: "1rem" }}>
        <p id={sectionHeadingId} style={{ ...muted, marginBottom: "0.5rem" }}>
          <strong>Партии по накладным</strong> — нажмите на строку, чтобы раскрыть список строк (калибр). id партии для API;
          в работе — номер накладной и калибр. Без оформленной накладной партии в список не попадают.
        </p>
        <p style={muted}>Нет партий, привязанных к оформленной накладной (или данные пусты).</p>
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
      <p id={sectionHeadingId} style={{ ...muted, marginBottom: "0.5rem" }}>
        <strong>Партии по накладным</strong> — нажмите на строку, чтобы раскрыть список строк (калибр). id партии для API;
        в работе — номер накладной и калибр. Без оформленной накладной партии в список не попадают.
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
        return (
          <details
            key={grp.documentId}
            className="birzha-nakl-details"
            open={openByDoc[grp.documentId] ?? false}
            onToggle={(e) => {
              const t = e.currentTarget;
              setOpenByDoc((p) => ({ ...p, [grp.documentId]: t.open }));
            }}
          >
            <summary className="birzha-nakl-details__summary" style={{ cursor: "pointer" }}>
              <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                Накладная № {grp.documentNumber ?? "—"}{" "}
                <span className="birzha-text-muted" style={{ fontWeight: 500, fontSize: "0.85rem" }}>
                  (строк: {nLines})
                </span>
              </span>{" "}
              <span style={{ fontSize: "0.88rem", fontWeight: 400 }}>
                <Link
                  to={purchaseNakladnayaDocumentPathForPath(pathname, grp.documentId)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                  }}
                >
                  открыть документ
                </Link>
              </span>
            </summary>
            <div className="birzha-nakl-details__body" style={{ overflowX: "auto", padding: "0 0 0.75rem" }}>
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
                      id партии
                    </th>
                    <th scope="col" style={thHeadDense}>
                      на складе, кг
                    </th>
                    <th scope="col" style={thHeadDense}>
                      в пути
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
                    <tr key={b.id}>
                      <td style={thtdDense}>{formatNakladLineLabel(b)}</td>
                      <td style={thtdDense}>
                        <code style={{ fontSize: "0.75rem" }} title={b.id}>
                          {formatShortBatchId(b.id)}
                        </code>
                      </td>
                      <td style={thtdDense}>{b.onWarehouseKg}</td>
                      <td style={thtdDense}>{b.inTransitKg}</td>
                      <td style={thtdDense}>{b.soldKg}</td>
                      <td style={thtdDense}>{b.pendingInboundKg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}
