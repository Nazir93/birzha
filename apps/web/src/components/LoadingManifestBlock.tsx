import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import type { LoadingManifestDetail } from "../api/types.js";
import {
  aggregateBatchesByCaliberLine,
  aggregateBatchesByPurchaseDocument,
  filterBatchesForLoadingManifest,
  formatLoadingManifestDisplayName,
  sumLoadingManifestTotals,
} from "../format/loading-manifest.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, btnStyleInline, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

export type LoadingManifestDocOption = { id: string; checkboxLabel: string };

export type LoadingManifestWriteOffProps = {
  enabled: boolean;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
  rejectInput: Record<string, string>;
  onRejectInputChange: (key: string, value: string) => void;
  onSubmitWriteOff: (inputKey: string, items: { batchId: string; kg: number }[]) => void;
};

type Props = {
  documentOptions: LoadingManifestDocOption[];
  /** Выбор вынесен в AllocationPanel, чтобы тот же фильтр применялся к «Шаг 3: строки». */
  selectedDocIds: ReadonlySet<string>;
  onToggleNaklDoc: (id: string) => void;
  onSelectAllNakl: () => void;
  onClearNakl: () => void;
  batchesInWh: BatchListItem[];
  warehouseName: string;
  manifest?: LoadingManifestDetail | null;
  writeOff?: LoadingManifestWriteOffProps | null;
};

function writeOffKeyCaliber(lineLabel: string): string {
  return `wo-cal:${lineLabel}`;
}

function writeOffKeyDocument(rowKey: string): string {
  return `wo-doc:${rowKey}`;
}

/** Если строка ПН есть, а партия не попала в текущий список склада — показать кг из снимка ПН. */
function syntheticBatchFromManifestLine(
  line: LoadingManifestDetail["lines"][number],
): BatchListItem {
  const pkgRaw = line.packageCount != null && line.packageCount !== "" ? Number(line.packageCount) : NaN;
  const linePk = Number.isFinite(pkgRaw) && pkgRaw > 0 ? pkgRaw : null;
  return {
    id: line.batchId,
    purchaseId: "—",
    totalKg: line.kg,
    pricePerKg: 0,
    pendingInboundKg: 0,
    onWarehouseKg: line.kg,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: null,
      warehouseId: null,
      productGradeCode: line.productGradeCode,
      productGroup: line.productGroup,
      documentNumber: line.purchaseDocumentNumber,
      linePackageCount: linePk,
    },
  };
}

/**
 * Свод на погрузку: мультинакл., таблица остатка по калибру или по накладной (с итого), списание брака тем же переключателем.
 */
export function LoadingManifestBlock({
  documentOptions,
  selectedDocIds,
  onToggleNaklDoc,
  onSelectAllNakl,
  onClearNakl,
  batchesInWh,
  warehouseName,
  manifest = null,
  writeOff = null,
}: Props) {
  const { pathname } = useLocation();
  const [stockTableMode, setStockTableMode] = useState<"caliber" | "nakladnaya">("caliber");
  const [writeOffGroupMode, setWriteOffGroupMode] = useState<"caliber" | "nakladnaya">("caliber");

  const includedBatchesFromSelection = useMemo(() => {
    const docCount =
      documentOptions.length > 0 && selectedDocIds.size === 0 ? 0 : documentOptions.length;
    return filterBatchesForLoadingManifest(batchesInWh, docCount, selectedDocIds);
  }, [batchesInWh, documentOptions.length, selectedDocIds]);
  const includedBatches = useMemo(() => {
    if (!manifest) {
      return includedBatchesFromSelection;
    }
    const byId = new Map(batchesInWh.map((b) => [b.id, b]));
    return manifest.lines.map((line) => {
      const b = byId.get(line.batchId);
      return b ?? syntheticBatchFromManifestLine(line);
    });
  }, [batchesInWh, includedBatchesFromSelection, manifest]);

  const totals = useMemo(() => sumLoadingManifestTotals(includedBatches), [includedBatches]);
  const caliberRows = useMemo(() => aggregateBatchesByCaliberLine(includedBatches), [includedBatches]);
  const documentRows = useMemo(() => aggregateBatchesByPurchaseDocument(includedBatches), [includedBatches]);

  const uniqueDocuments = useMemo(() => {
    const m = new Map<string, { id: string; number: string }>();
    for (const b of includedBatches) {
      const id = b.nakladnaya?.documentId;
      if (!id) {
        continue;
      }
      m.set(id, { id, number: b.nakladnaya?.documentNumber?.trim() || id });
    }
    return [...m.values()].sort((a, b) => a.number.localeCompare(b.number, "ru"));
  }, [includedBatches]);

  const stockTableLabelId = "loading-manifest-stock-table";
  const modeToggleId = "loading-manifest-mode";

  return (
    <section className="loading-manifest-print birzha-loading-manifest" aria-labelledby="loading-manifest-h">
      <h3 id="loading-manifest-h" style={{ fontSize: "1rem", margin: "0 0 0.4rem" }}>
        {manifest ? "Погрузочная накладная" : "Отбор партий со склада"}
      </h3>
      {manifest ? (
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.92rem" }}>
          <strong>
            {formatLoadingManifestDisplayName({
              manifestNumber: manifest.manifestNumber,
              destinationName: manifest.destinationName,
            })}
          </strong>{" "}
          от {manifest.docDate} · {manifest.warehouseName} ({manifest.warehouseCode})
        </p>
      ) : (
        <p className="birzha-callout-info" style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          Склад: <strong>{warehouseName}</strong>.
        </p>
      )}
      {documentOptions.length > 0 && (
        <div className="no-print" style={{ marginBottom: "0.75rem" }}>
          <p className="birzha-callout-info" style={{ fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
            Включить в отбор (один раз на документ)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.75rem", alignItems: "center" }}>
            {documentOptions.map((d) => (
              <label
                key={d.id}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}
              >
                <input type="checkbox" checked={selectedDocIds.has(d.id)} onChange={() => onToggleNaklDoc(d.id)} />
                {d.checkboxLabel}
              </label>
            ))}
            <button type="button" style={btnStyleInline} onClick={onSelectAllNakl}>
              Все
            </button>
            <button type="button" style={btnStyleInline} onClick={onClearNakl}>
              Снять
            </button>
          </div>
        </div>
      )}

      {uniqueDocuments.length > 0 && (
        <p className="no-print" style={{ fontSize: "0.86rem", margin: "0 0 0.5rem" }}>
          <span className="birzha-text-muted">Карточки накладных: </span>
          {uniqueDocuments.map((d) => (
            <span key={d.id} style={{ marginRight: 10 }}>
              <Link to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontSize: "0.9rem" }}>
                № {d.number}
              </Link>
            </span>
          ))}
        </p>
      )}

      <p style={{ margin: "0 0 0.4rem", fontSize: "0.92rem" }} role="status" aria-live="polite">
        <strong>Итого по отбору:</strong> {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг,{" "}
        {totals.batchCount} парт.
        {totals.linesWithPkg > 0 ? (
          <> · ящ. ≈ {totals.pkg.toLocaleString("ru-RU")} (оценка с накл.)</>
        ) : null}
      </p>

      {includedBatches.length === 0 && (
        <BirzhaEmptyState
          compact
          title="Нет строк в отборе"
          description={
            documentOptions.length > 0
              ? "Отметьте накладные либо на складе нет остатка (всё в рейсах — смотрите Операции)."
              : "Нет строк с остатком в данных."
          }
        />
      )}

      {includedBatches.length > 0 && (
        <div style={{ marginTop: "0.35rem" }}>
          {writeOff?.enabled ? (
            <div style={{ marginBottom: "0.85rem" }} className="no-print">
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Списание со склада</h4>
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
                Укажите калибр (или накладную) и кг — система спишет массу с партий автоматически, сверх остатка
                списать нельзя.
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.65rem 1.25rem",
                  alignItems: "baseline",
                  marginBottom: "0.45rem",
                  fontSize: "0.86rem",
                }}
              >
                <span className="birzha-text-muted">Списать по:</span>
                <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "caliber"}
                    onChange={() => setWriteOffGroupMode("caliber")}
                  />
                  калибрам
                </label>
                <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "nakladnaya"}
                    onChange={() => setWriteOffGroupMode("nakladnaya")}
                  />
                  накладным
                </label>
              </div>
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table style={{ ...tableStyle, minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={thHead}>{writeOffGroupMode === "caliber" ? "Калибр" : "Накладная"}</th>
                      <th style={thHead}>Остаток, кг</th>
                      <th style={thHead}>Списать, кг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeOffGroupMode === "caliber"
                      ? caliberRows.map((row) => {
                          const inputKey = writeOffKeyCaliber(row.lineLabel);
                          return (
                            <tr key={`wo-cal-${row.lineLabel}`}>
                              <td style={thtd}>
                                <strong>{row.lineLabel}</strong>
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td style={thtd}>
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={thtd}>
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="кг"
                                    value={writeOff.rejectInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать кг, ${row.lineLabel}`}
                                    style={{ ...fieldStyle, width: "5rem" }}
                                  />
                                  <button
                                    type="button"
                                    style={btnStyle}
                                    disabled={writeOff.isPending}
                                    onClick={() => {
                                      const s = (writeOff.rejectInput[inputKey] ?? "").replace(",", ".");
                                      const kg = parseFloat(s);
                                      if (!Number.isFinite(kg) || kg <= 0 || kg > row.totalKg) {
                                        return;
                                      }
                                      let remaining = kg;
                                      const items: { batchId: string; kg: number }[] = [];
                                      for (const batch of row.batches) {
                                        if (remaining <= 0) {
                                          break;
                                        }
                                        const kgFromBatch = Math.min(remaining, batch.onWarehouseKg);
                                        if (kgFromBatch > 0) {
                                          items.push({ batchId: batch.id, kg: kgFromBatch });
                                          remaining -= kgFromBatch;
                                        }
                                      }
                                      if (items.length > 0) {
                                        writeOff.onSubmitWriteOff(inputKey, items);
                                      }
                                    }}
                                  >
                                    Списать
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      : documentRows.map((row) => {
                          const inputKey = writeOffKeyDocument(row.rowKey);
                          return (
                            <tr key={`wo-doc-${row.rowKey}`}>
                              <td style={thtd}>
                                {row.documentId ? (
                                  <Link
                                    to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {row.displayLabel}
                                  </Link>
                                ) : (
                                  <strong>{row.displayLabel}</strong>
                                )}
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td style={thtd}>
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={thtd}>
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="кг"
                                    value={writeOff.rejectInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать кг, ${row.displayLabel}`}
                                    style={{ ...fieldStyle, width: "5rem" }}
                                  />
                                  <button
                                    type="button"
                                    style={btnStyle}
                                    disabled={writeOff.isPending}
                                    onClick={() => {
                                      const s = (writeOff.rejectInput[inputKey] ?? "").replace(",", ".");
                                      const kg = parseFloat(s);
                                      if (!Number.isFinite(kg) || kg <= 0 || kg > row.totalKg) {
                                        return;
                                      }
                                      let remaining = kg;
                                      const items: { batchId: string; kg: number }[] = [];
                                      for (const batch of row.batches) {
                                        if (remaining <= 0) {
                                          break;
                                        }
                                        const kgFromBatch = Math.min(remaining, batch.onWarehouseKg);
                                        if (kgFromBatch > 0) {
                                          items.push({ batchId: batch.id, kg: kgFromBatch });
                                          remaining -= kgFromBatch;
                                        }
                                      }
                                      if (items.length > 0) {
                                        writeOff.onSubmitWriteOff(inputKey, items);
                                      }
                                    }}
                                  >
                                    Списать
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
              {writeOff.isError && writeOff.errorMessage ? (
                <ErrorAlert message={writeOff.errorMessage} title="Списание" />
              ) : null}
            </div>
          ) : null}

          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}
            id={stockTableLabelId}
          >
            Остаток в отборе (после списания)
          </h4>
          <div
            className="no-print"
            id={modeToggleId}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem 1.25rem",
              alignItems: "baseline",
              marginBottom: "0.45rem",
              fontSize: "0.86rem",
            }}
          >
            <span className="birzha-text-muted">Показать:</span>
            <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "caliber"}
                onChange={() => setStockTableMode("caliber")}
              />
              по калибрам
            </label>
            <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "nakladnaya"}
                onChange={() => setStockTableMode("nakladnaya")}
              />
              по накладным
            </label>
          </div>

          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table
              style={tableStyle}
              className="loading-manifest-table"
              aria-labelledby={stockTableLabelId}
              aria-describedby={modeToggleId}
              aria-label={stockTableMode === "caliber" ? "Остаток по калибрам" : "Остаток по накладным"}
            >
              <thead>
                <tr>
                  {stockTableMode === "caliber" ? (
                    <th scope="col" style={thHead}>
                      Калибр (как в накладной)
                    </th>
                  ) : (
                    <th scope="col" style={thHead}>
                      Накладная
                    </th>
                  )}
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    На складе, кг
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Ящ. (оц.)
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Парт.
                  </th>
                </tr>
              </thead>
              <tbody>
                {stockTableMode === "caliber"
                  ? caliberRows.map((row) => (
                      <tr key={row.lineLabel}>
                        <td style={thtd}>
                          <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{row.lineLabel}</span>
                        </td>
                        <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                          {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          {row.linesWithPkg === 0 ? "—" : `≈ ${row.totalPkg}`}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>{row.partCount}</td>
                      </tr>
                    ))
                  : documentRows.map((row) => (
                      <tr key={row.rowKey}>
                        <td style={thtd}>
                          {row.documentId ? (
                            <Link
                              to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                              style={{ fontSize: "0.92rem", fontWeight: 600 }}
                            >
                              {row.displayLabel}
                            </Link>
                          ) : (
                            <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{row.displayLabel}</span>
                          )}
                        </td>
                        <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                          {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          {row.linesWithPkg === 0 ? "—" : `≈ ${row.totalPkg}`}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>{row.partCount}</td>
                      </tr>
                    ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ ...thtd, fontWeight: 700, textAlign: "left" }}>
                    Итого
                  </th>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                    {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                    {totals.linesWithPkg === 0 ? "—" : `≈ ${totals.pkg.toLocaleString("ru-RU")}`}
                  </td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{totals.batchCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
