import { compareProductGradeLineLabels, purchaseLineAmountKopecksFromDecimalStrings } from "@birzha/contracts";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { salesCaliberAggregateKey, salesCaliberLineLabel } from "./batch-label.js";

function bi(x: string | undefined): bigint {
  if (x === undefined || x === "") {
    return 0n;
  }
  return BigInt(x);
}

function gramsToKgDecimalString(grams: bigint): string {
  const abs = grams < 0n ? -grams : grams;
  const whole = abs / 1000n;
  const frac = abs % 1000n;
  const body = `${whole}.${frac.toString().padStart(3, "0")}`;
  return grams < 0n ? `-${body}` : body;
}

/** Закупочная стоимость отгруженных граммов по цене партии, копейки. */
export function shipmentPurchaseCostKopecks(grams: bigint, pricePerKg: number | null | undefined): bigint {
  if (grams <= 0n || pricePerKg == null || !Number.isFinite(pricePerKg) || pricePerKg < 0) {
    return 0n;
  }
  return BigInt(
    purchaseLineAmountKopecksFromDecimalStrings(gramsToKgDecimalString(grams), String(pricePerKg)),
  );
}

export type TripShipmentByCaliberRow = {
  lineLabel: string;
  grams: bigint;
  packages: bigint;
  /** Сумма закупа по строке, копейки. */
  costKopecks: bigint;
};

export type TripLoadingManifestSummary = {
  rows: TripShipmentByCaliberRow[];
  totalGrams: bigint;
  totalPackages: bigint;
  totalCostKopecks: bigint;
};

/** Свод погрузочной по рейсу: калибры сложены, с закупочной стоимостью. */
export function aggregateTripShipmentByCaliber(
  report: ShipmentReportResponse,
  batchById: Map<string, BatchListItem>,
): TripLoadingManifestSummary {
  const m = new Map<string, TripShipmentByCaliberRow>();
  for (const line of report.shipment.byBatch) {
    const g = bi(line.grams);
    if (g <= 0n) {
      continue;
    }
    const batch = batchById.get(line.batchId);
    const key = batch?.nakladnaya?.productGradeCode?.trim() || batch?.nakladnaya?.productGroup?.trim()
      ? salesCaliberAggregateKey(batch, line.batchId)
      : "unknown-caliber";
    let row = m.get(key);
    if (!row) {
      row = {
        lineLabel:
          key === "unknown-caliber"
            ? "Калибр не указан"
            : salesCaliberLineLabel(batch, key),
        grams: 0n,
        packages: 0n,
        costKopecks: 0n,
      };
      m.set(key, row);
    }
    row.grams += g;
    row.packages += bi(line.packageCount);
    row.costKopecks += shipmentPurchaseCostKopecks(g, batch?.pricePerKg);
  }
  const rows = [...m.values()].sort((a, b) => compareProductGradeLineLabels(a.lineLabel, b.lineLabel));
  return {
    rows,
    totalGrams: rows.reduce((a, r) => a + r.grams, 0n),
    totalPackages: rows.reduce((a, r) => a + r.packages, 0n),
    totalCostKopecks: rows.reduce((a, r) => a + r.costKopecks, 0n),
  };
}

/** Средняя цена закупа ₽/кг по строке (для подписи); null если нет массы или суммы. */
export function averagePurchaseRubPerKgLabel(grams: bigint, costKopecks: bigint): string | null {
  if (grams <= 0n || costKopecks <= 0n) {
    return null;
  }
  const kgMilli = grams;
  const rubMilli = (costKopecks * 1000n) / kgMilli;
  const rub = rubMilli / 100n;
  const kop = rubMilli % 100n;
  const kopStr = kop < 10n ? `0${kop}` : `${kop}`;
  return `${rub.toString()},${kopStr}`;
}
