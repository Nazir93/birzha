import type { BatchListItem, TripSaleLineJson } from "../api/types.js";
import { formatNakladLineLabel } from "./batch-label.js";
import { kgNumberToGramsBigInt } from "./seller-trip-caliber-groups.js";
import { inferPaymentKindFromSaleLine } from "./trip-sale-line-payment.js";

/** Окно для склейки частей одной продажи, сохранённых подряд (разные saleId / секунды). */
const LEGACY_SALE_GROUP_WINDOW_MS = 120_000;

function caliberKeyForBatch(batch: BatchListItem | undefined, batchId: string): string {
  if (!batch) {
    return `__id:${batchId}`;
  }
  const g = batch.nakladnaya?.productGroup?.trim() ?? "";
  const c = batch.nakladnaya?.productGradeCode?.trim() ?? "";
  if (!g && !c) {
    return `__id:${batchId}`;
  }
  return `\0${g}\0${c}`;
}

function legacySaleGroupKey(line: TripSaleLineJson, batch: BatchListItem | undefined): string {
  const caliber = caliberKeyForBatch(batch, line.batchId);
  const tsBucket = Math.floor(Date.parse(line.recordedAt) / LEGACY_SALE_GROUP_WINDOW_MS);
  const pay = inferPaymentKindFromSaleLine(line);
  return `leg:${tsBucket}\0${line.pricePerKgKopecks}\0${line.saleChannel}\0${caliber}\0${line.wholesaleBuyerId ?? ""}\0${pay}`;
}

/**
 * Ключ группы для «Исправить продажи».
 * Сначала общий saleId (все части одной «Зафиксировать»), иначе — калибр + цена + окно по времени.
 */
export function tripSaleLineCorrectionsGroupKey(
  line: TripSaleLineJson,
  batch: BatchListItem | undefined,
  saleIdLineCount: Map<string, number>,
): string {
  if ((saleIdLineCount.get(line.saleId) ?? 0) > 1) {
    return `sid:${line.saleId}`;
  }
  return legacySaleGroupKey(line, batch);
}

export type TripSaleLineCorrectionsGroup = {
  key: string;
  lines: TripSaleLineJson[];
  lineLabel: string;
  totalKg: string;
  totalPackages: string | null;
  totalRevenueKopecks: bigint;
};

function gramsBigIntToKgDecimalString(g: bigint): string {
  if (g === 0n) {
    return "0";
  }
  const whole = g / 1000n;
  const rem = g % 1000n;
  if (rem === 0n) {
    return whole.toString();
  }
  return `${whole}.${rem.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

/** Схлопывает строки журнала, созданные одной продажей по калибру (несколько партий). */
export function groupTripSaleLinesForCorrections(
  lines: TripSaleLineJson[],
  batchById: Map<string, BatchListItem>,
): TripSaleLineCorrectionsGroup[] {
  const saleIdLineCount = new Map<string, number>();
  for (const line of lines) {
    saleIdLineCount.set(line.saleId, (saleIdLineCount.get(line.saleId) ?? 0) + 1);
  }

  const m = new Map<string, TripSaleLineJson[]>();
  for (const line of lines) {
    const b = batchById.get(line.batchId);
    const key = tripSaleLineCorrectionsGroupKey(line, b, saleIdLineCount);
    const arr = m.get(key) ?? [];
    arr.push(line);
    m.set(key, arr);
  }

  const out: TripSaleLineCorrectionsGroup[] = [];
  for (const [key, groupLines] of m) {
    const sorted = groupLines.slice().sort((a, b) => a.id.localeCompare(b.id));
    const first = sorted[0]!;
    const sampleBatch = batchById.get(first.batchId);
    const lineLabel = sampleBatch ? formatNakladLineLabel(sampleBatch) : "—";

    let grams = 0n;
    let pkg = 0n;
    let hasPkg = false;
    let revenue = 0n;
    for (const l of sorted) {
      grams += kgNumberToGramsBigInt(Number(l.kg.replace(",", ".")));
      revenue += BigInt(l.revenueKopecks);
      if (l.packageCount) {
        hasPkg = true;
        pkg += BigInt(l.packageCount);
      }
    }

    out.push({
      key,
      lines: sorted,
      lineLabel,
      totalKg: gramsBigIntToKgDecimalString(grams),
      totalPackages: hasPkg ? String(pkg) : null,
      totalRevenueKopecks: revenue,
    });
  }

  out.sort((a, b) => {
    const ta = Math.max(...a.lines.map((l) => Date.parse(l.recordedAt)));
    const tb = Math.max(...b.lines.map((l) => Date.parse(l.recordedAt)));
    if (tb !== ta) {
      return tb - ta;
    }
    return a.key.localeCompare(b.key);
  });
  return out;
}
