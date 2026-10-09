import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { isFieldSellerOnly } from "../auth/role-panels.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import {
  aggregateTripSalesByProductLine,
  type TripSalesByProductLineRow,
} from "../format/aggregate-trip-sales-by-product-line.js";
import { gramsToKgLabel, kopecksToRubLabelSafe } from "../format/money.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { sellerFieldExpenseCategoryLabel } from "../format/seller-field-expense-labels.js";
import {
  buildDayScopedReport,
  listSellerTripReportDays,
} from "../format/seller-trip-daily-report.js";
import { formatPackageCountLabel } from "../format/seller-trip-metrics.js";
import { isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import {
  formatTripSaleClientDisplayLabel,
  salesChannelTotals,
  salesClientLinesForChannel,
  shouldShowSalesClientTable,
  type SaleChannelFilter,
} from "../format/trip-sales-channel.js";
import { queryRoots, tripSaleLinesQueryOptions } from "../query/core-list-queries.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { SellerSaleChannelPills } from "./SellerSaleChannelPills.js";
import { SellerTripLoadingManifest } from "./SellerTripLoadingManifest.js";
import { TripDebtReceivablesSection } from "./TripDebtReceivablesSection.js";
import { dateFieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

function sumSalesByProductLine(rows: TripSalesByProductLineRow[]) {
  let grams = 0n;
  let packages = 0n;
  let revenue = 0n;
  let cash = 0n;
  let card = 0n;
  let debt = 0n;
  for (const row of rows) {
    grams += row.grams;
    packages += row.packages;
    revenue += row.revenue;
    cash += row.cash;
    card += row.card;
    debt += row.debt;
  }
  return { grams, packages, revenue, cash, card, debt };
}

function PaymentCells({
  cashKopecks,
  cardKopecks,
  debtKopecks,
}: {
  cashKopecks: string | bigint;
  cardKopecks: string | bigint;
  debtKopecks: string | bigint;
}) {
  const cash = typeof cashKopecks === "bigint" ? cashKopecks.toString() : cashKopecks;
  const card = typeof cardKopecks === "bigint" ? cardKopecks.toString() : cardKopecks;
  const debt = typeof debtKopecks === "bigint" ? debtKopecks.toString() : debtKopecks;
  return (
    <>
      <td style={thtd}>{kopecksToRubLabelSafe(cash)} ₽</td>
      <td style={thtd}>{kopecksToRubLabelSafe(card)} ₽</td>
      <td style={thtd}>{kopecksToRubLabelSafe(debt)} ₽</td>
    </>
  );
}

const payHead = (
  <>
    <th scope="col" style={thHead}>
      Выручка
    </th>
    <th scope="col" style={thHead}>
      Нал
    </th>
    <th scope="col" style={thHead}>
      Карта
    </th>
    <th scope="col" style={thHead}>
      Долг
    </th>
  </>
);

function ChannelSummaryStrip({ channel, sales }: { channel: SaleChannelFilter; sales: ShipmentReportResponse["sales"] }) {
  const t = salesChannelTotals(sales, channel);
  const label = channel === "all" ? "Всего" : channel === "retail" ? "Розница" : "Опт";
  return (
    <div
      className="birzha-callout-info"
      style={{ marginBottom: "1rem", display: "grid", gap: "0.35rem", fontSize: "0.92rem" }}
      role="status"
    >
      <strong>{label}</strong>
      <span>
        Продано: <strong>{gramsToKgLabel(t.grams)}</strong> кг
        {t.packages > 0n ? (
          <>
            {" "}
            · <strong>{formatPackageCountLabel(t.packages)}</strong> ящ
          </>
        ) : null}{" "}
        · выручка <strong>{kopecksToRubLabelSafe(t.revenueKopecks)} ₽</strong>
      </span>
      <span className="birzha-text-muted birzha-ui-sm">
        Оплата: нал {kopecksToRubLabelSafe(t.cashKopecks)} ₽ · карта {kopecksToRubLabelSafe(t.cardTransferKopecks)} ₽ · долг{" "}
        {kopecksToRubLabelSafe(t.debtKopecks)} ₽
      </span>
    </div>
  );
}

export function FieldSellerTripReport({
  report,
  batchById,
}: {
  report: ShipmentReportResponse;
  batchById: Map<string, BatchListItem>;
}) {
  const { user, meta } = useAuth();
  const qc = useQueryClient();
  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const fieldOnly = Boolean(user && isFieldSellerOnly(user));
  const canDeleteExpenses = fieldOnly && isTripOpenForSellerWorkspace(report.trip);
  const [channel, setChannel] = useState<SaleChannelFilter>("all");
  /** `null` — весь рейс; иначе YYYY-MM-DD. */
  const [dayYmd, setDayYmd] = useState<string | null>(null);

  useEffect(() => {
    setDayYmd(null);
  }, [report.trip.id]);

  const linesQ = useQuery({
    ...tripSaleLinesQueryOptions(report.trip.id),
    enabled: Boolean(report.trip.id),
  });
  const saleLines = linesQ.data?.lines ?? [];
  const activityDays = useMemo(
    () => listSellerTripReportDays({ lines: saleLines, expenses: report.fieldExpenses ?? [] }),
    [saleLines, report.fieldExpenses],
  );
  /** Пока строки не загрузились — не режем день (иначе пустая касса). */
  const effectiveDay = linesQ.isSuccess ? dayYmd : null;
  const view = useMemo(
    () => buildDayScopedReport(report, saleLines, effectiveDay),
    [report, saleLines, effectiveDay],
  );
  const { sales } = view;
  const retailTotals = salesChannelTotals(sales, "retail");
  const wholesaleTotals = salesChannelTotals(sales, "wholesale");
  const allTotals = salesChannelTotals(sales, "all");
  const dayLabel = effectiveDay ? formatPurchaseDocDateRu(effectiveDay) : null;

  const delExpenseM = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/seller-field-expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
      await assertOkResponse(res);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      await qc.invalidateQueries({ queryKey: queryRoots.sellerFieldExpenses });
      await qc.invalidateQueries({ queryKey: queryRoots.tripSaleLines });
      await qc.invalidateQueries({ queryKey: ["accounting", "period-summary"] });
    },
  });

  const salesByProductLine = useMemo(
    () => aggregateTripSalesByProductLine(view, batchById, channel),
    [view, batchById, channel],
  );
  const clientLines = useMemo(() => salesClientLinesForChannel(sales, channel), [sales, channel]);
  const caliberTotals = sumSalesByProductLine(salesByProductLine);
  const clientTotals = salesChannelTotals(sales, channel);

  const hasWholesale = sales.wholesaleGrams !== "0" && sales.wholesaleGrams !== "";
  const hasRetail = sales.retailGrams !== "0" && sales.retailGrams !== "";

  return (
    <div style={{ marginTop: "1rem" }} role="region" aria-label={`Отчёт ${report.trip.tripNumber}`}>
      <section className="birzha-seller-day-filter no-print" aria-label="Период отчёта">
        <div className="birzha-seller-day-filter__head">
          <h3 className="birzha-form-label" style={{ margin: 0, fontSize: "0.95rem" }}>
            {dayLabel ? `Отчёт за ${dayLabel}` : "Отчёт за весь рейс"}
          </h3>
          {linesQ.isPending ? (
            <span className="birzha-text-muted birzha-ui-sm">Загрузка дней…</span>
          ) : null}
        </div>
        <div className="birzha-seller-day-filter__pills" role="group" aria-label="День отчёта">
          <button
            type="button"
            className={`birzha-btn birzha-btn--inline birzha-admin-summary-toggle${dayYmd === null ? " birzha-admin-summary-toggle--active" : ""}`}
            onClick={() => setDayYmd(null)}
          >
            Весь рейс
          </button>
          {activityDays.map((ymd) => (
            <button
              key={ymd}
              type="button"
              className={`birzha-btn birzha-btn--inline birzha-admin-summary-toggle${dayYmd === ymd ? " birzha-admin-summary-toggle--active" : ""}`}
              onClick={() => setDayYmd(ymd)}
              disabled={linesQ.isPending}
            >
              {formatPurchaseDocDateRu(ymd)}
            </button>
          ))}
        </div>
        <div className="birzha-seller-day-filter__calendar">
          <label className="birzha-form-label" htmlFor="seller-report-day" style={{ margin: 0 }}>
            Дата
          </label>
          <BirzhaDateField
            id="seller-report-day"
            aria-label="Дата дневного отчёта"
            value={dayYmd ?? ""}
            onChange={(ymd) => setDayYmd(ymd.trim() ? ymd : null)}
            style={{ ...dateFieldStyle, maxWidth: "14rem" }}
            disabled={linesQ.isPending}
          />
        </div>
        {linesQ.isError ? (
          <ErrorAlert
            error={linesQ.error}
            title="Дни отчёта"
            message="Не удалось загрузить продажи по дням. Показан весь рейс."
          />
        ) : null}
      </section>

      <SellerTripLoadingManifest report={report} batchById={batchById} defaultOpen />
      {report.shortage.totalGrams !== "0" && report.shortage.totalGrams !== "" ? (
        <p className="birzha-callout-info" style={{ margin: "0 0 1rem", fontSize: "0.92rem" }} role="status">
          Недостача по рейсу: <strong>{gramsToKgLabel(report.shortage.totalGrams)} кг</strong>
          {report.shortage.totalPackageCount &&
          report.shortage.totalPackageCount !== "0" &&
          report.shortage.totalPackageCount !== "" ? (
            <>
              {" "}
              · <strong>{report.shortage.totalPackageCount} ящ</strong>
            </>
          ) : null}
          {dayLabel ? <span className="birzha-text-muted"> · за весь рейс</span> : null}
        </p>
      ) : null}

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
        Траты с кассы{dayLabel ? ` · ${dayLabel}` : ""}
      </h3>
      <p className="birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
        Итого траты{" "}
        <strong>{kopecksToRubLabelSafe(view.financials.fieldExpensesKopecks)} ₽</strong>
        {" · "}к сдаче{" "}
        <strong>{kopecksToRubLabelSafe(view.financials.cashToHandOverKopecks)} ₽</strong>
        {effectiveDay == null &&
        view.financials.debtOutstandingKopecks != null &&
        view.financials.debtOutstandingKopecks !== "0" &&
        view.financials.debtOutstandingKopecks !== "" ? (
          <>
            {" · "}остаток долгов{" "}
            <strong>{kopecksToRubLabelSafe(view.financials.debtOutstandingKopecks)} ₽</strong>
          </>
        ) : null}
      </p>
      {delExpenseM.isError ? <ErrorAlert error={delExpenseM.error} title="Удаление траты" /> : null}
      {(view.fieldExpenses ?? []).length === 0 ? (
        <BirzhaEmptyState compact title={dayLabel ? `Трат за ${dayLabel} нет` : "Трат по рейсу нет"} />
      ) : (
        <div className="birzha-table-scroll" style={{ marginBottom: "1rem" }}>
          <table style={{ ...tableStyle, minWidth: canDeleteExpenses ? 560 : 480 }} aria-label="Траты с кассы">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Дата
                </th>
                <th scope="col" style={thHead}>
                  Категория
                </th>
                <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                  Сумма
                </th>
                <th scope="col" style={thHead}>
                  Комментарий
                </th>
                {canDeleteExpenses ? <th scope="col" style={thHead} /> : null}
              </tr>
            </thead>
            <tbody>
              {(view.fieldExpenses ?? []).map((e) => (
                <tr key={e.id}>
                  <td style={thtd}>{formatPurchaseDocDateRu(e.expenseDate)}</td>
                  <td style={thtd}>{sellerFieldExpenseCategoryLabel(e.category)}</td>
                  <td style={{ ...thtd, textAlign: "right" }}>{kopecksToRubLabelSafe(e.amountKopecks)} ₽</td>
                  <td style={thtd}>{e.comment?.trim() ? e.comment : "—"}</td>
                  {canDeleteExpenses ? (
                    <td style={thtd}>
                      <button
                        type="button"
                        className="birzha-clean-ops-text-btn"
                        disabled={delExpenseM.isPending}
                        onClick={() => {
                          if (window.confirm("Удалить трату?")) {
                            void delExpenseM.mutate(e.id);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="birzha-table-subtotal-row">
                <th scope="row" style={{ ...thtd, fontWeight: 700 }} colSpan={2}>
                  Итого
                </th>
                <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                  {kopecksToRubLabelSafe(view.financials.fieldExpensesKopecks)} ₽
                </td>
                <td style={thtd} colSpan={canDeleteExpenses ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <TripDebtReceivablesSection receivables={view.debtReceivables ?? []} compact />

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
        Анализ продаж{dayLabel ? ` · ${dayLabel}` : ""}
      </h3>
      <SellerSaleChannelPills
        value={channel}
        onChange={setChannel}
        wholesaleDisabled={!wholesalersCatalog}
        wholesaleDisabledTitle="Справочник оптовиков недоступен"
      />

      {channel !== "all" ? <ChannelSummaryStrip channel={channel} sales={sales} /> : null}

      {channel === "all" ? (
        <>
          <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
            Как продано
          </h3>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "1rem" }}>
            <table style={tableStyle} aria-label="Как продано">
              <thead>
                <tr>
                  <th scope="col" style={thHead} />
                  <th scope="col" style={thHead}>
                    кг
                  </th>
                  <th scope="col" style={thHead}>
                    ящ
                  </th>
                  {payHead}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" style={thtd}>
                    Розница
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.retailGrams)}</td>
                  <td style={thtd}>{formatPackageCountLabel(retailTotals.packages)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.retailRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.retailCashKopecks}
                    cardKopecks={sales.retailCardTransferKopecks}
                    debtKopecks={sales.retailDebtKopecks}
                  />
                </tr>
                <tr>
                  <th scope="row" style={thtd}>
                    Опт
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.wholesaleGrams)}</td>
                  <td style={thtd}>{formatPackageCountLabel(wholesaleTotals.packages)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.wholesaleRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.wholesaleCashKopecks}
                    cardKopecks={sales.wholesaleCardTransferKopecks}
                    debtKopecks={sales.wholesaleDebtKopecks}
                  />
                </tr>
                <tr className="birzha-table-subtotal-row">
                  <th scope="row" style={thtd}>
                    Итого
                  </th>
                  <td style={thtd}>{gramsToKgLabel(sales.totalGrams)}</td>
                  <td style={thtd}>{formatPackageCountLabel(allTotals.packages)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(sales.totalRevenueKopecks)} ₽</td>
                  <PaymentCells
                    cashKopecks={sales.totalCashKopecks}
                    cardKopecks={sales.totalCardTransferKopecks}
                    debtKopecks={sales.totalDebtKopecks}
                  />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
        {channel === "all" ? "Продано по калибрам" : channel === "retail" ? "Розница по калибрам" : "Опт по калибрам"}
      </h3>
      {salesByProductLine.length === 0 ? (
        <BirzhaEmptyState
          compact
          title={
            dayLabel && !hasWholesale && !hasRetail
              ? `Нет продаж за ${dayLabel}`
              : channel === "wholesale" && !hasWholesale
                ? "Нет оптовых продаж"
                : channel === "retail" && !hasRetail
                  ? "Нет розничных продаж"
                  : "Нет продаж"
          }
        />
      ) : (
        <div className="birzha-table-scroll birzha-table-scroll--sticky-head" style={{ marginBottom: "1rem" }}>
          <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Продано по калибрам">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Калибр
                </th>
                <th scope="col" style={thHead}>
                  кг
                </th>
                <th scope="col" style={thHead}>
                  ящ
                </th>
                {payHead}
              </tr>
            </thead>
            <tbody>
              {salesByProductLine.map((row) => (
                <tr key={row.aggregateKey}>
                  <td style={thtd}>{row.lineLabel}</td>
                  <td style={thtd}>{gramsToKgLabel(row.grams.toString())}</td>
                  <td style={thtd}>{formatPackageCountLabel(row.packages)}</td>
                  <td style={thtd}>{kopecksToRubLabelSafe(row.revenue.toString())} ₽</td>
                  <PaymentCells cashKopecks={row.cash} cardKopecks={row.card} debtKopecks={row.debt} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="birzha-table-subtotal-row">
                <th scope="row" style={thtd}>
                  Итого
                </th>
                <td style={thtd}>{gramsToKgLabel(caliberTotals.grams.toString())}</td>
                <td style={thtd}>{formatPackageCountLabel(caliberTotals.packages)}</td>
                <td style={thtd}>{kopecksToRubLabelSafe(caliberTotals.revenue.toString())} ₽</td>
                <PaymentCells
                  cashKopecks={caliberTotals.cash}
                  cardKopecks={caliberTotals.card}
                  debtKopecks={caliberTotals.debt}
                />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {shouldShowSalesClientTable(channel) ? (
        <>
          <h3 className="birzha-form-label" style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
            {channel === "all" ? "Кому продано" : "Опт — кому"}
          </h3>
          {clientLines.length === 0 ? (
            <BirzhaEmptyState compact title="Нет продаж по клиентам" />
          ) : (
            <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
              <table style={{ ...tableStyle, minWidth: 560 }} aria-label="Кому продано">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Кому
                    </th>
                    <th scope="col" style={thHead}>
                      кг
                    </th>
                    <th scope="col" style={thHead}>
                      ящ
                    </th>
                    {payHead}
                  </tr>
                </thead>
                <tbody>
                  {clientLines.map((row, idx) => (
                    <tr key={`${row.clientLabel}-${idx}`}>
                      <td style={thtd}>{formatTripSaleClientDisplayLabel(row.clientLabel, channel)}</td>
                      <td style={thtd}>{gramsToKgLabel(row.grams)}</td>
                      <td style={thtd}>{formatPackageCountLabel(BigInt((row.packageCount ?? "0").trim() || "0"))}</td>
                      <td style={thtd}>{kopecksToRubLabelSafe(row.revenueKopecks)} ₽</td>
                      <PaymentCells
                        cashKopecks={row.cashKopecks}
                        cardKopecks={row.cardTransferKopecks}
                        debtKopecks={row.debtKopecks}
                      />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="birzha-table-subtotal-row">
                    <th scope="row" style={thtd}>
                      Итого
                    </th>
                    <td style={thtd}>{gramsToKgLabel(clientTotals.grams)}</td>
                    <td style={thtd}>{formatPackageCountLabel(clientTotals.packages)}</td>
                    <td style={thtd}>{kopecksToRubLabelSafe(clientTotals.revenueKopecks)} ₽</td>
                    <PaymentCells
                      cashKopecks={clientTotals.cashKopecks}
                      cardKopecks={clientTotals.cardTransferKopecks}
                      debtKopecks={clientTotals.debtKopecks}
                    />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
