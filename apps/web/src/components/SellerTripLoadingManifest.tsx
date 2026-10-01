import { useMemo, useState } from "react";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { aggregateTripShipmentByCaliber } from "../format/aggregate-trip-shipment-loading.js";
import { gramsToKgLabel } from "../format/money.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { tableStyle, thHead, thtd } from "../ui/styles.js";

function packageCountLabel(raw: string | bigint | undefined): string {
  try {
    const n = typeof raw === "bigint" ? raw : BigInt((raw ?? "0").toString().trim() || "0");
    return n > 0n ? n.toString() : "—";
  } catch {
    return "—";
  }
}

type Props = {
  report: ShipmentReportResponse;
  batchById: Map<string, BatchListItem>;
  /** Вложенный disclosure на экране продажи. */
  nested?: boolean;
  defaultOpen?: boolean;
};

/**
 * Погрузочная по рейсу для продавца: калибр / кг / ящики без закупочных цен и сумм.
 */
export function SellerTripLoadingManifest({
  report,
  batchById,
  nested = false,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const loadingManifest = useMemo(
    () => aggregateTripShipmentByCaliber(report, batchById),
    [report, batchById],
  );

  const dateLabel = useMemo(() => {
    const raw = report.trip.departedAt?.trim();
    if (!raw) {
      return null;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return raw;
    }
    return d.toLocaleDateString("ru-RU");
  }, [report.trip.departedAt]);

  const printLoadingManifest = () => {
    setOpen(true);
    document.body.classList.add("birzha-print-trip-loading-manifest");
    const cleanup = () => {
      document.body.classList.remove("birzha-print-trip-loading-manifest");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(cleanup, 60_000);
    requestAnimationFrame(() => {
      window.print();
    });
  };

  return (
    <BirzhaDisclosure
      nested={nested}
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="birzha-disclosure__title-stack">
          <span className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
            Погрузочная накладная
          </span>
        </span>
      }
    >
      <div id="trip-loading-manifest-print" className="birzha-trip-loading-manifest-print">
        <h3
          className="birzha-trip-loading-manifest-print__title"
          style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}
        >
          Погрузочная накладная
        </h3>
        <div className="no-print birzha-clean-ops-row-actions" style={{ marginBottom: "0.45rem" }}>
          <button
            type="button"
            className="birzha-btn"
            onClick={printLoadingManifest}
            disabled={loadingManifest.rows.length === 0}
            aria-label="Печать погрузочной накладной"
          >
            Печать
          </button>
        </div>
        <p className="birzha-ui-sm" style={{ margin: "0 0 0.55rem", lineHeight: 1.45 }}>
          <strong>Машина:</strong> {report.trip.vehicleLabel?.trim() || "—"}
          {report.trip.driverName?.trim() ? ` · водитель ${report.trip.driverName.trim()}` : null}
          {" · "}
          рейс {report.trip.tripNumber}
          {report.trip.destinationName?.trim() || report.trip.destinationCode?.trim()
            ? ` · ${report.trip.destinationName?.trim() || report.trip.destinationCode}`
            : null}
          {report.trip.productGroup?.trim() ? ` · ${report.trip.productGroup.trim()}` : null}
          {" · "}
          <strong>дата:</strong> {dateLabel ?? "—"}
        </p>
        {loadingManifest.rows.length === 0 ? (
          <BirzhaEmptyState compact title="Погрузок в рейс пока нет" />
        ) : (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 360 }} aria-label="Погрузочная накладная">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Калибр
                  </th>
                  <th scope="col" style={thHead}>
                    Кг
                  </th>
                  <th scope="col" style={thHead}>
                    Ящ.
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingManifest.rows.map((row) => (
                  <tr key={row.lineLabel}>
                    <td style={thtd}>{row.lineLabel}</td>
                    <td style={thtd}>{gramsToKgLabel(row.grams.toString())}</td>
                    <td style={thtd}>{packageCountLabel(row.packages)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ ...thtd, fontWeight: 700 }}>
                    Итого
                  </th>
                  <td style={{ ...thtd, fontWeight: 700 }}>
                    {gramsToKgLabel(loadingManifest.totalGrams.toString())}
                  </td>
                  <td style={{ ...thtd, fontWeight: 700 }}>
                    {packageCountLabel(loadingManifest.totalPackages)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </BirzhaDisclosure>
  );
}
