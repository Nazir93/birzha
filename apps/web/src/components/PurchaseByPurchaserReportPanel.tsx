import { useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { purchaseByPurchaserReportQueryOptions } from "../query/core-list-queries.js";
import { formatYmd } from "./BirzhaCalendarFields.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { dateFieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = formatYmd(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = formatYmd(last.getFullYear(), last.getMonth(), last.getDate());
  return { from, to };
}

function kgLabel(kg: number): string {
  return kg.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

const thNum: CSSProperties = { ...thHead, textAlign: "right", whiteSpace: "nowrap" };
const tdNum: CSSProperties = {
  ...thtd,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
const tdText: CSSProperties = { ...thtd, whiteSpace: "nowrap" };

/**
 * Отчёт «закупщик × склад» за период по дате накладной.
 * Вход: из «Отчёты и рейсы» (не отдельный пункт сайдбара).
 */
export function PurchaseByPurchaserReportPanel() {
  const { pathname } = useLocation();
  const reportsPath = adminAwarePathForPath(pathname, adminRoutes.reports, ops.reports);
  const initial = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);

  const q = useQuery({
    ...purchaseByPurchaserReportQueryOptions(applied.from, applied.to),
  });

  const report = q.data;

  return (
    <section className="birzha-section-shell" aria-labelledby="purchase-by-purchaser-h">
      <p className="birzha-ui-sm no-print" style={{ margin: "0 0 0.75rem" }}>
        <Link to={reportsPath} style={{ fontWeight: 600 }}>
          ← Отчёты и рейсы
        </Link>
      </p>

      <header className="birzha-section-hero" style={{ marginBottom: "1rem" }}>
        <h2 id="purchase-by-purchaser-h" className="birzha-home-hero__title">
          Закупки по закупщикам
        </h2>
        <p className="birzha-ui-sm birzha-section-note" style={{ maxWidth: "40rem" }}>
          Сколько каждый закупщик занёс на склад: сумма ₽, кг и ящики. Период — по дате
          закупочной накладной.
        </p>
      </header>

      <form
        className="birzha-toolbar no-print"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ from, to });
        }}
      >
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          С
          <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
        </label>
        <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
          По
          <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
        </label>
        <button type="submit" className="birzha-btn birzha-btn--primary">
          Показать
        </button>
      </form>

      {q.isError ? (
        <ErrorAlert message="Не удалось загрузить отчёт. Нужны права admin или manager." title="Отчёт" />
      ) : null}

      {q.isFetching && !report ? (
        <LoadingBlock label="Загрузка отчёта…" minHeight={120} skeleton skeletonRows={6} />
      ) : null}

      {report ? (
        <>
          <div
            className="birzha-admin-dash-modern__kpi"
            style={{ marginBottom: "1.25rem" }}
            role="group"
            aria-label="Итоги периода"
          >
            <div className="birzha-kpi-tile">
              <div className="birzha-kpi-tile__label">Накладных</div>
              <div className="birzha-kpi-tile__value">{report.grand.documentCount}</div>
            </div>
            <div className="birzha-kpi-tile">
              <div className="birzha-kpi-tile__label">Сумма</div>
              <div className="birzha-kpi-tile__value">{kopecksToRubDisplay(report.grand.totalKopecks)} ₽</div>
            </div>
            <div className="birzha-kpi-tile">
              <div className="birzha-kpi-tile__label">Кг</div>
              <div className="birzha-kpi-tile__value">{kgLabel(report.grand.totalKg)}</div>
            </div>
            <div className="birzha-kpi-tile">
              <div className="birzha-kpi-tile__label">Ящики</div>
              <div className="birzha-kpi-tile__value">{report.grand.packageCount}</div>
            </div>
          </div>
          <p className="birzha-ui-sm birzha-text-muted" style={{ margin: "0 0 1rem" }}>
            Период {report.from} — {report.to}
          </p>

          <BirzhaDisclosure
            defaultOpen
            title={
              <h3 id="pbp-cells" style={{ fontSize: "0.95rem", margin: 0 }}>
                Закупщик × склад
              </h3>
            }
          >
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={{ ...tableStyle, minWidth: 640 }} aria-labelledby="pbp-cells">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Закупщик
                    </th>
                    <th scope="col" style={thHead}>
                      Склад
                    </th>
                    <th scope="col" style={thNum}>
                      Накл.
                    </th>
                    <th scope="col" style={thNum}>
                      Кг
                    </th>
                    <th scope="col" style={thNum}>
                      Ящ.
                    </th>
                    <th scope="col" style={thNum}>
                      Сумма, ₽
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.cells.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...thtd, textAlign: "center" }}>
                        Нет накладных за период
                      </td>
                    </tr>
                  ) : (
                    report.cells.map((c) => (
                      <tr key={`${c.purchaserUserId ?? "none"}-${c.warehouseId}`}>
                        <td style={tdText}>{c.purchaserLogin}</td>
                        <td style={tdText}>{c.warehouseName}</td>
                        <td style={tdNum}>{c.documentCount}</td>
                        <td style={tdNum}>{kgLabel(c.totalKg)}</td>
                        <td style={tdNum}>{c.packageCount}</td>
                        <td style={tdNum}>{kopecksToRubDisplay(c.totalKopecks)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </BirzhaDisclosure>

          <div style={{ marginTop: "1rem" }}>
            <BirzhaDisclosure
              defaultOpen
              title={
                <h3 id="pbp-by-purchaser" style={{ fontSize: "0.95rem", margin: 0 }}>
                  Итого по закупщикам
                </h3>
              }
            >
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table style={{ ...tableStyle, minWidth: 520 }} aria-labelledby="pbp-by-purchaser">
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        Закупщик
                      </th>
                      <th scope="col" style={thNum}>
                        Накл.
                      </th>
                      <th scope="col" style={thNum}>
                        Кг
                      </th>
                      <th scope="col" style={thNum}>
                        Ящ.
                      </th>
                      <th scope="col" style={thNum}>
                        Сумма, ₽
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byPurchaser.map((p) => (
                      <tr key={p.purchaserUserId ?? "none"}>
                        <td style={tdText}>{p.purchaserLogin}</td>
                        <td style={tdNum}>{p.documentCount}</td>
                        <td style={tdNum}>{kgLabel(p.totalKg)}</td>
                        <td style={tdNum}>{p.packageCount}</td>
                        <td style={tdNum}>{kopecksToRubDisplay(p.totalKopecks)}</td>
                      </tr>
                    ))}
                    {report.byPurchaser.length > 0 ? (
                      <tr className="birzha-table-subtotal-row birzha-table-subtotal-row--emphasis">
                        <th scope="row" style={thtd}>
                          Всего
                        </th>
                        <td style={tdNum}>{report.grand.documentCount}</td>
                        <td style={tdNum}>{kgLabel(report.grand.totalKg)}</td>
                        <td style={tdNum}>{report.grand.packageCount}</td>
                        <td style={tdNum}>{kopecksToRubDisplay(report.grand.totalKopecks)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </BirzhaDisclosure>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <BirzhaDisclosure
              defaultOpen
              title={
                <h3 id="pbp-by-warehouse" style={{ fontSize: "0.95rem", margin: 0 }}>
                  Итого по складам
                </h3>
              }
            >
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table style={{ ...tableStyle, minWidth: 520 }} aria-labelledby="pbp-by-warehouse">
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        Склад
                      </th>
                      <th scope="col" style={thNum}>
                        Накл.
                      </th>
                      <th scope="col" style={thNum}>
                        Кг
                      </th>
                      <th scope="col" style={thNum}>
                        Ящ.
                      </th>
                      <th scope="col" style={thNum}>
                        Сумма, ₽
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byWarehouse.map((w) => (
                      <tr key={w.warehouseId}>
                        <td style={tdText}>{w.warehouseName}</td>
                        <td style={tdNum}>{w.documentCount}</td>
                        <td style={tdNum}>{kgLabel(w.totalKg)}</td>
                        <td style={tdNum}>{w.packageCount}</td>
                        <td style={tdNum}>{kopecksToRubDisplay(w.totalKopecks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BirzhaDisclosure>
          </div>
        </>
      ) : null}
    </section>
  );
}
