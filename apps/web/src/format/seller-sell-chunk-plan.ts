import { purchaseLineAmountKopecksFromDecimalStrings } from "@birzha/contracts";

import type { BatchListItem } from "../api/types.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";
import {
  allocateSellGramsAcrossTripRows,
  findSellerCaliberGroupForBatch,
  gramsBigIntToKgNumber,
  kgNumberToGramsBigInt,
  maxSellableGramsForBatch,
} from "./seller-trip-caliber-groups.js";

export type SellerSellChunk = {
  batchId: string;
  kg: number;
  cashKopecksMixed?: string;
  cardTransferKopecks?: string;
};

function splitKopecksProRata(totalKopecks: bigint, chunkRevenues: bigint[]): bigint[] {
  if (chunkRevenues.length === 0) {
    return [];
  }
  const sumRev = chunkRevenues.reduce((a, b) => a + b, 0n);
  if (sumRev <= 0n) {
    const base = totalKopecks / BigInt(chunkRevenues.length);
    let assigned = 0n;
    return chunkRevenues.map((_, i) => {
      if (i === chunkRevenues.length - 1) {
        return totalKopecks - assigned;
      }
      assigned += base;
      return base;
    });
  }
  const out: bigint[] = [];
  let assigned = 0n;
  for (let i = 0; i < chunkRevenues.length; i++) {
    if (i === chunkRevenues.length - 1) {
      out.push(totalKopecks - assigned);
    } else {
      const part = (totalKopecks * chunkRevenues[i]!) / sumRev;
      out.push(part);
      assigned += part;
    }
  }
  return out;
}

function lineRevenueKopecks(kg: number, pricePerKg: number): bigint {
  const k = purchaseLineAmountKopecksFromDecimalStrings(String(kg), String(pricePerKg), {
    kgMaxFrac: 6,
    priceMaxFrac: 4,
  });
  return BigInt(Math.round(k));
}

/**
 * План продажи для кабинета продавца: кг по партиям + доли оплаты (если калибр в нескольких партиях).
 * Сумма грамм по чанкам = запрошенным граммам; сумма копеек нал/карты = введённой сумме.
 */
export function buildSellerSellChunks(input: {
  sellBatchId: string;
  sellableRows: TripBatchTableRow[];
  batchById: Map<string, BatchListItem>;
  kg: number;
  pricePerKg: number;
  paymentKind: "cash" | "debt" | "mixed" | "card_transfer";
  cashKopecksMixed?: string;
  cardTransferKopecks?: string;
}): SellerSellChunk[] {
  const requestedG = kgNumberToGramsBigInt(input.kg);
  if (requestedG <= 0n) {
    return [];
  }

  const maxG = maxSellableGramsForBatch(input.sellBatchId, input.sellableRows, input.batchById);
  if (requestedG > maxG) {
    throw new Error(
      `Не больше ${gramsBigIntToKgNumber(maxG)} кг в машине по выбранному калибру`,
    );
  }

  const group = findSellerCaliberGroupForBatch(input.sellBatchId, input.sellableRows, input.batchById);
  const rows =
    group && group.rows.length > 0
      ? group.rows
      : input.sellableRows.filter((r) => r.batchId === input.sellBatchId);

  const gramParts = allocateSellGramsAcrossTripRows(rows, requestedG);
  const allocatedSum = gramParts.reduce((s, p) => s + p.grams, 0n);
  if (allocatedSum !== requestedG) {
    throw new Error("Кг продажи больше остатка «в машине» по этому калибру");
  }

  const chunks: SellerSellChunk[] = gramParts.map((p) => ({
    batchId: p.batchId,
    kg: gramsBigIntToKgNumber(p.grams),
  }));

  if (chunks.length === 1) {
    const only = chunks[0]!;
    if (input.paymentKind === "mixed" && input.cashKopecksMixed) {
      only.cashKopecksMixed = input.cashKopecksMixed;
    }
    if (input.paymentKind === "card_transfer" && input.cardTransferKopecks) {
      only.cardTransferKopecks = input.cardTransferKopecks;
    }
    return chunks;
  }

  const revenues = chunks.map((c) => lineRevenueKopecks(c.kg, input.pricePerKg));

  if (input.paymentKind === "mixed" && input.cashKopecksMixed) {
    const split = splitKopecksProRata(BigInt(input.cashKopecksMixed), revenues);
    split.forEach((cash, i) => {
      chunks[i]!.cashKopecksMixed = String(cash);
    });
  }
  if (input.paymentKind === "card_transfer" && input.cardTransferKopecks) {
    const split = splitKopecksProRata(BigInt(input.cardTransferKopecks), revenues);
    split.forEach((card, i) => {
      chunks[i]!.cardTransferKopecks = String(card);
    });
  }

  return chunks;
}
