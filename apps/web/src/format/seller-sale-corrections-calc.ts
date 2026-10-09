import { kgNumberToGramsBigInt } from "./seller-trip-caliber-groups.js";
import type { TripSaleLineCorrectionsGroup } from "./trip-sale-line-groups.js";

export type SaleCorrectionsCalcTotals = {
  selectedCount: number;
  grams: bigint;
  packages: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  cardKopecks: bigint;
  debtKopecks: bigint;
};

export function emptySaleCorrectionsCalcTotals(): SaleCorrectionsCalcTotals {
  return {
    selectedCount: 0,
    grams: 0n,
    packages: 0n,
    revenueKopecks: 0n,
    cashKopecks: 0n,
    cardKopecks: 0n,
    debtKopecks: 0n,
  };
}

/** Сумма выбранных групп из «Исправить продажи» (для локального калькулятора). */
export function sumSelectedSaleCorrectionGroups(
  groups: readonly TripSaleLineCorrectionsGroup[],
  selectedKeys: ReadonlySet<string>,
): SaleCorrectionsCalcTotals {
  const out = emptySaleCorrectionsCalcTotals();
  for (const group of groups) {
    if (!selectedKeys.has(group.key)) {
      continue;
    }
    out.selectedCount += 1;
    out.revenueKopecks += group.totalRevenueKopecks;
    for (const line of group.lines) {
      out.grams += kgNumberToGramsBigInt(Number(line.kg.replace(",", ".")));
      out.cashKopecks += BigInt(line.cashKopecks || "0");
      out.cardKopecks += BigInt(line.cardTransferKopecks || "0");
      out.debtKopecks += BigInt(line.debtKopecks || "0");
      if (line.packageCount) {
        out.packages += BigInt(line.packageCount);
      }
    }
  }
  return out;
}
