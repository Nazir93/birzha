import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useAuth } from "../auth/auth-context.js";
import { groupPurchaseDocumentsBySupplier } from "../format/accounting-supplier-purchase-docs.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { kopecksToRubLabel } from "../format/money.js";
import { purchaseDocumentsPagedQueryOptions } from "../query/core-list-queries.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

/**
 * Тепличники и их закупочные накладные для бухгалтерии:
 * номер, склад (регион), кг, сумма закупа по каждой накладной.
 */
export function AccountingSuppliersNakladnayaPanel() {
  const { meta } = useAuth();
  const purchaseApiEnabled = meta?.purchaseDocumentsApi === "enabled";
  const [search, setSearch] = useState("");

  const docsQ = useQuery({
    ...purchaseDocumentsPagedQueryOptions({
      limit: 500,
      offset: 0,
      scope: "all",
      search: search.trim() || undefined,
    }),
    enabled: purchaseApiEnabled,
  });

  const groups = useMemo(
    () => groupPurchaseDocumentsBySupplier(docsQ.data?.purchaseDocuments ?? []),
    [docsQ.data?.purchaseDocuments],
  );

  if (!purchaseApiEnabled) {
    return (
      <InfoAlert title="Закупочные накладные">
        Список закупочных временно недоступен. Обратитесь к администратору.
      </InfoAlert>
    );
  }

  return (
    <div role="region" aria-label="Тепличники и накладные">
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem", maxWidth: "44rem" }}>
        По каждому тепличнику — отдельные закупочные накладные: номер, склад, кг и сумма закупа. Долг поставщику в
        системе пока не ведётся — ниже только сумма по документам («сколько отдали» по закупке).
      </p>

      <label className="birzha-form-label birzha-form-label--block birzha-form-label--mb-sm" htmlFor="acc-sup-search">
        Поиск
      </label>
      <input
        id="acc-sup-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...fieldStyle, maxWidth: "22rem", marginBottom: "0.85rem" }}
        placeholder="№ накладной или тепличник"
        autoComplete="off"
      />

      {docsQ.isError ? <ErrorAlert error={docsQ.error} title="Закупочные накладные" /> : null}
      {docsQ.isPending ? <LoadingBlock label="Загрузка накладных…" minHeight={64} skeleton skeletonRows={4} /> : null}

      {docsQ.isSuccess && groups.length === 0 ? (
        <BirzhaEmptyState
          compact
          title={search.trim() ? "Ничего не найдено" : "Нет закупочных накладных"}
          description={
            search.trim()
              ? `По запросу «${search.trim()}» накладных нет.`
              : "Когда появятся закупки, здесь будут тепличники и их документы."
          }
        />
      ) : null}

      {groups.map((g) => {
        return (
          <BirzhaDisclosure
            key={g.key}
            nested
            defaultOpen={groups.length <= 3}
            title={
              <span style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 1rem", alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.98rem" }}>{g.supplierName}</strong>
                <span className="birzha-text-muted birzha-ui-sm">
                  {g.documents.length} накл. · {g.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг ·{" "}
                  {kopecksToRubLabel(g.totalKopecks.toString())} ₽
                </span>
              </span>
            }
          >
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table
                style={{ ...tableStyle, minWidth: 720 }}
                aria-label={`Накладные тепличника ${g.supplierName}`}
              >
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      № накладной
                    </th>
                    <th scope="col" style={thHead}>
                      Дата
                    </th>
                    <th scope="col" style={thHead}>
                      Склад / регион
                    </th>
                    <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                      Кг
                    </th>
                    <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                      Сумма закупа, ₽
                    </th>
                    <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                      Строк
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.documents.map((d) => (
                    <tr key={d.id}>
                      <th scope="row" style={thtd}>
                        <strong>{d.documentNumber}</strong>
                      </th>
                      <td style={thtd}>{formatPurchaseDocDateRu(d.docDate)}</td>
                      <td style={thtd}>{d.warehouseName?.trim() || "—"}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>
                        {(d.totalKg ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                        {kopecksToRubLabel(d.documentTotalKopecks ?? "0")}
                      </td>
                      <td style={{ ...thtd, textAlign: "right" }}>{d.lineCount}</td>
                    </tr>
                  ))}
                  <tr className="birzha-table-subtotal-row">
                    <th scope="row" colSpan={3} style={{ ...thtd, textAlign: "left" }}>
                      Итого по тепличнику
                    </th>
                    <td style={{ ...thtd, textAlign: "right" }}>
                      {g.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabel(g.totalKopecks.toString())}</td>
                    <td style={thtd} />
                  </tr>
                </tbody>
              </table>
            </div>
          </BirzhaDisclosure>
        );
      })}
    </div>
  );
}
