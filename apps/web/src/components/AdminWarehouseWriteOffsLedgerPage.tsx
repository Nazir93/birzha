import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { warehouseWriteOffsLedgerQueryOptions, warehousesFullListQueryOptions } from "../query/core-list-queries.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHead, thtd, selectFieldStyle } from "../ui/styles.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";

/**
 * Журнал списаний массы с остатка на складе (брак / quality_reject), по данным PostgreSQL.
 */
export function AdminWarehouseWriteOffsLedgerPage() {
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [limit, setLimit] = useState(300);

  const warehousesQ = useQuery(warehousesFullListQueryOptions());
  const ledgerQ = useQuery({
    ...warehouseWriteOffsLedgerQueryOptions({
      warehouseId: warehouseId.trim() || undefined,
      limit,
    }),
    enabled: meta?.warehouseWriteOffApi === "enabled",
  });

  const lines = ledgerQ.data?.lines ?? [];
  const sumShown = useMemo(() => lines.reduce((a, r) => a + r.kg, 0), [lines]);

  if (meta?.warehouseWriteOffApi !== "enabled") {
    return (
      <BirzhaEmptyState
        title="Журнал недоступен"
        description="Запустите API с PostgreSQL и включённым списанием со склада — тогда здесь появятся записи."
      />
    );
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Списания с остатка на складе</h2>
      <p className="birzha-callout-info" style={{ marginBottom: "0.75rem", lineHeight: 1.45 }}>
        Все операции «брак, кг» из распределения: склад, накладная, партия и время. Данные только для списаний по
        закупочным накладным (строка партии в документе).
      </p>

      <div className="birzha-form-grid" style={{ marginBottom: "0.75rem", maxWidth: 480 }}>
        <label>
          Склад (фильтр)
          <BirzhaSelect
            value={warehouseId}
            onChange={setWarehouseId}
            style={{ ...selectFieldStyle, marginTop: 4 }}
            placeholder="Все склады"
            options={[
              { value: "", label: "Все склады" },
              ...(warehousesQ.data?.warehouses ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                .map((w) => ({
                  value: w.id,
                  label: `${w.name} (${w.code})`,
                })),
            ]}
          />
        </label>
        <label>
          Лимит строк
          <BirzhaSelect
            value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            style={{ ...selectFieldStyle, marginTop: 4 }}
            options={[
              { value: "100", label: "100" },
              { value: "200", label: "200" },
              { value: "300", label: "300" },
              { value: "500", label: "500" },
            ]}
          />
        </label>
      </div>

      {ledgerQ.isPending && <LoadingBlock label="Загрузка журнала…" minHeight={80} skeleton skeletonRows={5} />}

      {ledgerQ.isError ? <ErrorAlert error={ledgerQ.error} title="Журнал списаний" /> : null}

      {!ledgerQ.isPending && !ledgerQ.isError && lines.length === 0 && (
        <BirzhaEmptyState compact title="Записей пока нет" description="Списания появятся после первой операции в «Распределении»." />
      )}

      {lines.length > 0 && (
        <>
          <p style={{ margin: "0 0 0.45rem", fontSize: "0.9rem" }} role="status">
            <strong>Всего в списке:</strong> {sumShown.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг ·{" "}
            {lines.length} опер.
          </p>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thHead}>Когда</th>
                  <th style={thHead}>Склад</th>
                  <th style={thHead}>Накладная</th>
                  <th style={thHead}>Калибр</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Списано, кг</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((r) => (
                  <tr key={r.id}>
                    <td style={thtd}>{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                    <td style={thtd}>
                      {r.warehouseName ?? "—"}
                      {r.warehouseCode ? (
                        <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 4 }}>
                          ({r.warehouseCode})
                        </span>
                      ) : null}
                    </td>
                    <td style={thtd}>
                      <Link to={purchaseNakladnayaDocumentPathForPath(pathname, r.purchaseDocumentId)}>
                        № {r.documentNumber?.trim() || "—"}
                      </Link>
                    </td>
                    <td style={thtd}>{r.productGradeCode ?? "—"}</td>
                    <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                      {r.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
