import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { warehouseWriteOffsLedgerQueryOptions, warehousesFullListQueryOptions } from "../query/core-list-queries.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { tableStyle, thHead, thtd, selectFieldStyle } from "../ui/styles.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";

const PAGE_SIZE = 50;

/**
 * Журнал возвратов на склад при погрузке: склад, время, накладная, калибр, кг и ящики.
 * Остаток на складе при возврате не уменьшается — товар доступен для другого направления.
 */
export function WarehouseReturnsPage() {
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [pageIndex, setPageIndex] = useState(0);

  const warehousesQ = useQuery(warehousesFullListQueryOptions());
  const ledgerQ = useQuery({
    ...warehouseWriteOffsLedgerQueryOptions({
      warehouseId: warehouseId.trim() || undefined,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    }),
    enabled: meta?.warehouseWriteOffApi === "enabled",
  });

  const lines = ledgerQ.data?.lines ?? [];
  const totalCount = ledgerQ.data?.listMeta?.totalCount ?? lines.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const sumShown = useMemo(() => lines.reduce((a, r) => a + r.kg, 0), [lines]);
  const packagesShown = useMemo(
    () => lines.reduce((a, r) => a + (r.packageCount ?? 0), 0),
    [lines],
  );
  const totalKgAll = ledgerQ.data?.totalKgAll ?? ledgerQ.data?.totalKg ?? sumShown;

  if (meta?.warehouseWriteOffApi !== "enabled") {
    return (
      <BirzhaEmptyState
        title="Журнал недоступен"
        description="Запустите API с PostgreSQL — тогда здесь появятся возвраты на склад из погрузки."
      />
    );
  }

  return (
    <div className="birzha-section-shell">
      <header className="birzha-section-hero" style={{ marginBottom: "0.75rem" }}>
        <h2 className="birzha-section-title-main" style={{ margin: 0 }}>
          Возврат на склад
        </h2>
        <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0.35rem 0 0", maxWidth: "42rem", lineHeight: 1.45 }}>
          Товар снимается с отбора и из активных погрузочных накладных. Физический остаток на складе
          не списывается — эти кг снова можно погрузить в другой рейс. Журнал хранит историю возвратов.
        </p>
      </header>

      <div className="birzha-form-grid" style={{ marginBottom: "0.75rem", maxWidth: 480 }}>
        <label>
          Склад
          <BirzhaSelect
            value={warehouseId}
            onChange={(v) => {
              setWarehouseId(v);
              setPageIndex(0);
            }}
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
      </div>

      {ledgerQ.isPending && <LoadingBlock label="Загрузка журнала…" minHeight={80} skeleton skeletonRows={6} />}

      {ledgerQ.isError ? <ErrorAlert error={ledgerQ.error} title="Журнал возвратов" /> : null}

      {!ledgerQ.isPending && !ledgerQ.isError && lines.length === 0 && (
        <BirzhaEmptyState
          compact
          title="Возвратов пока нет"
          description="Операция «Вернуть на склад» — в разделе «Погрузка на машину» на шаге отбора партий."
        />
      )}

      {lines.length > 0 && (
        <>
          <p style={{ margin: "0 0 0.45rem", fontSize: "0.9rem" }} role="status">
            <strong>Всего по фильтру:</strong>{" "}
            {totalKgAll.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
            <span className="birzha-text-muted"> · {totalCount.toLocaleString("ru-RU")} записей</span>
            {pageCount > 1 ? (
              <>
                <span className="birzha-text-muted"> · </span>
                <strong>На странице:</strong>{" "}
                {sumShown.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
                {packagesShown > 0 ? (
                  <>
                    {" "}
                    · ≈ {packagesShown.toLocaleString("ru-RU")} ящ.
                  </>
                ) : null}
                <span className="birzha-text-muted">
                  {" "}
                  · {lines.length} из {totalCount}
                </span>
              </>
            ) : packagesShown > 0 ? (
              <>
                <span className="birzha-text-muted"> · </span>
                ≈ {packagesShown.toLocaleString("ru-RU")} ящ. (оценка по строкам накладной)
              </>
            ) : null}
          </p>          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 820 }} aria-label="Журнал возвратов на склад">
              <thead>
                <tr>
                  <th style={thHead}>Когда</th>
                  <th style={thHead}>Склад</th>
                  <th style={thHead}>№ накладной</th>
                  <th style={thHead}>Калибр</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Кг</th>
                  <th style={{ ...thHead, textAlign: "right" }}>Ящ.</th>
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
                        {r.documentNumber?.trim() ? `№ ${r.documentNumber.trim()}` : "—"}
                      </Link>
                    </td>
                    <td style={thtd}>{r.productGradeCode ?? "—"}</td>
                    <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                      {r.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...thtd, textAlign: "right" }}>
                      {r.packageCount != null && r.packageCount > 0
                        ? r.packageCount.toLocaleString("ru-RU")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <BirzhaPagination
              pageIndex={pageIndex}
              pageCount={pageCount}
              itemLabel="записей"
              onPageChange={setPageIndex}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
