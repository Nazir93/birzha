import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import { formatBatchPartyCaption, formatShortBatchId } from "../format/batch-label.js";
import { purchaseNakladnayaDocumentPath } from "../routes.js";
import { btnStyle, btnStyleInline, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

const ORPHAN = "__unassigned__";

type DocOption = { id: string; number: string };

function estimatedPackageCountOnShelf(b: BatchListItem): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (b.totalKg <= 0) {
    return null;
  }
  return Math.max(0, Math.round((b.onWarehouseKg / b.totalKg) * linePk));
}

/**
 * Сводный «лист на погрузку»: несколько закупочных накладных на выбранном складе, итоги, экспорт.
 * Бухучёт: закуп и суммы по документу — в исходных накладных; **остаток/факт** — в партиях (после отгрузок в «Операциях»).
 */
export function LoadingManifestBlock({
  selectedWarehouse,
  documentOptions,
  batchesInWh,
  warehouseName,
}: {
  selectedWarehouse: string;
  documentOptions: DocOption[];
  batchesInWh: BatchListItem[];
  warehouseName: string;
}) {
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set());
  const docIdKey = useMemo(
    () =>
      documentOptions
        .map((d) => d.id)
        .sort()
        .join(","),
    [documentOptions],
  );

  useEffect(() => {
    if (documentOptions.length > 0) {
      setSelectedDocIds(new Set(documentOptions.map((d) => d.id)));
    } else {
      setSelectedDocIds(new Set());
    }
  }, [docIdKey, documentOptions]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllDocs = () => {
    setSelectedDocIds(new Set(documentOptions.map((d) => d.id)));
  };
  const clearAllDocs = () => {
    setSelectedDocIds(new Set());
  };

  const includedBatches = useMemo(() => {
    return batchesInWh.filter((b) => {
      if (b.onWarehouseKg <= 0) {
        return false;
      }
      const docId = b.nakladnaya?.documentId;
      if (documentOptions.length === 0) {
        return true;
      }
      if (!docId) {
        return true;
      }
      return selectedDocIds.has(docId);
    });
  }, [batchesInWh, documentOptions.length, selectedDocIds]);

  const totals = useMemo(() => {
    let kg = 0;
    let pkg = 0;
    let linesWithPkg = 0;
    for (const b of includedBatches) {
      kg += b.onWarehouseKg;
      const e = estimatedPackageCountOnShelf(b);
      if (e != null) {
        pkg += e;
        linesWithPkg += 1;
      }
    }
    return { kg, pkg, linesWithPkg, batchCount: includedBatches.length };
  }, [includedBatches]);

  const buildCsv = useCallback(() => {
    const head = [
      "Номер_накл",
      "ID_накл",
      "Партия",
      "Кг_ост",
      "Ящ_оцен",
      "Калибр_лейбл",
    ];
    const rows = [head.join(";")];
    for (const b of includedBatches) {
      const docN = b.nakladnaya?.documentNumber?.replace(/;/g, " ") ?? "";
      const docId = b.nakladnaya?.documentId ?? "";
      const pkgE = estimatedPackageCountOnShelf(b);
      const cap = formatBatchPartyCaption(b, b.id).replace(/;/g, " ");
      rows.push(
        [docN, docId, formatShortBatchId(b.id), String(b.onWarehouseKg), pkgE == null ? "" : String(pkgE), cap].join(
          ";",
        ),
      );
    }
    rows.push("");
    rows.push(
      `Итого;кг;${totals.kg};;;ящ_оц_сумм;${totals.pkg};строк;${includedBatches.length}`,
    );
    return "\uFEFF" + rows.join("\n");
  }, [includedBatches, totals]);

  const downloadCsv = useCallback(() => {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pogruzka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  if (selectedWarehouse === ORPHAN) {
    return null;
  }

  return (
    <section
      className="loading-manifest-print"
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1rem",
        border: "1px solid #d4d4d8",
        borderRadius: 8,
        background: "#fefce8",
      }}
      aria-labelledby="loading-manifest-h"
    >
      <h3 id="loading-manifest-h" style={{ fontSize: "1rem", margin: "0 0 0.4rem" }}>
        Сбор на погрузку: несколько накладных
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        Отметьте, какие <strong>закупочные накладные</strong> сходятся на склад <strong>{warehouseName}</strong> в одну
        погрузку. В таблице — <strong>остаток</strong> по партиям (тот же учёт, что в «Операциях»); после отгрузки в рейс
        цифры уменьшатся. Для <strong>правок закупа/строк</strong> откройте накладную по ссылке. Для бухгалтера: закуп и
        графа сумм — в <strong>исходном</strong> документе; здесь — свод по остаткам перед/при погрузке, без нового
        «юридического» PDF в БД.
      </p>
      {documentOptions.length > 0 && (
        <div className="no-print" style={{ marginBottom: "0.75rem" }}>
          <p style={{ ...muted, fontSize: "0.86rem", margin: "0 0 0.4rem" }}>Включить накладные в лист</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.75rem", alignItems: "center" }}>
            {documentOptions.map((d) => (
              <label
                key={d.id}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selectedDocIds.has(d.id)}
                  onChange={() => toggleDoc(d.id)}
                />
                № {d.number}
              </label>
            ))}
            <button type="button" style={btnStyleInline} onClick={selectAllDocs}>
              Все
            </button>
            <button type="button" style={btnStyleInline} onClick={clearAllDocs}>
              Снять
            </button>
          </div>
        </div>
      )}

      <p style={{ margin: "0 0 0.4rem", fontSize: "0.92rem" }} role="status" aria-live="polite">
        <strong>Итого по листу:</strong> {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг,{" "}
        {totals.batchCount} парт.
        {totals.linesWithPkg > 0 ? (
          <> · ящ. ≈ {totals.pkg.toLocaleString("ru-RU")} (оценка с накл.)</>
        ) : null}
      </p>

      {includedBatches.length === 0 && (
        <p style={muted}>
          Нет строк: отмечьте накладные выше либо на складе нет остатка (всё в рейсах/списания — смотрите накладные).
        </p>
      )}

      {includedBatches.length > 0 && (
        <div style={{ overflowX: "auto" }} role="table">
          <table style={tableStyle} className="loading-manifest-table" aria-label="Свод для погрузки">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Накладная
                </th>
                <th scope="col" style={thHead}>
                  Позиция / партия
                </th>
                <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                  Остаток, кг
                </th>
                <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                  Ящ. (оц.)
                </th>
                <th scope="col" style={thHead} className="no-print">
                  Ссылка
                </th>
              </tr>
            </thead>
            <tbody>
              {includedBatches.map((b) => {
                const pkgE = estimatedPackageCountOnShelf(b);
                return (
                  <tr key={b.id}>
                    <td style={thtd}>
                      {b.nakladnaya?.documentNumber != null
                        ? `№ ${b.nakladnaya.documentNumber}`
                        : "—"}{" "}
                      {b.nakladnaya?.documentId && (
                        <div className="no-print" style={{ marginTop: 4 }}>
                          <Link
                            to={purchaseNakladnayaDocumentPath(b.nakladnaya.documentId)}
                            style={{ fontSize: "0.86rem" }}
                          >
                            карточка
                          </Link>
                        </div>
                      )}
                    </td>
                    <td style={thtd}>
                      {formatBatchPartyCaption(b, b.id)}
                      <code style={{ display: "block", fontSize: "0.75rem", color: "#52525b", marginTop: 2 }}>
                        {formatShortBatchId(b.id)}
                      </code>
                    </td>
                    <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>{b.onWarehouseKg}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{pkgE == null ? "—" : `≈ ${pkgE}`}</td>
                    <td className="no-print" style={thtd}>
                      {b.nakladnaya?.documentId ? (
                        <Link
                          to={purchaseNakladnayaDocumentPath(b.nakladnaya.documentId)}
                          style={{ fontSize: "0.86rem" }}
                        >
                          к накладной
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {includedBatches.length > 0 && (
        <p className="no-print" style={{ margin: "0.6rem 0 0" }}>
          <button type="button" style={btnStyle} onClick={() => window.print()}>
            Печать листа
          </button>{" "}
          <button type="button" style={btnStyle} onClick={downloadCsv}>
            Скачать CSV
          </button>
        </p>
      )}
    </section>
  );
}
