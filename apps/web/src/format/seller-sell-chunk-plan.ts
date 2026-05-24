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
import { maxSellablePackageCountForRowForSell } from "./trip-report-rows.js";

export type SellerSellChunk = {
  batchId: string;
  kg: number;
  packageCount?: number;
  cashKopecksMixed?: string;
  cardTransferKopecks?: string;
};

/**
 * Раскладывает ящики по партиям с учётом лимита на каждую (как кг), без превышения API.
 */
export function allocateSellPackagesAcrossGramParts(
  gramParts: { batchId: string; grams: bigint }[],
  rows: TripBatchTableRow[],
  batchById: Map<string, BatchListItem>,
  requestedPackages: number,
): { batchId: string; packageCount: number }[] {
  if (requestedPackages <= 0 || gramParts.length === 0) {
    return [];
  }
  const totalG = gramParts.reduce((s, p) => s + p.grams, 0n);
  if (totalG <= 0n) {
    return [];
  }
  const rowByBatch = new Map(rows.map((r) => [r.batchId, r]));
  const caps = new Map<string, number>();
  for (const p of gramParts) {
    const row = rowByBatch.get(p.batchId);
    caps.set(
      p.batchId,
      row ? Number(maxSellablePackageCountForRowForSell(row, batchById.get(p.batchId))) : 0,
    );
  }
  const assigned = new Map<string, number>();
  for (const p of gramParts) {
    assigned.set(p.batchId, 0);
  }
  let remaining = requestedPackages;

  for (let i = 0; i < gramParts.length; i++) {
    const p = gramParts[i]!;
    const cap = caps.get(p.batchId) ?? 0;
    let share =
      i === gramParts.length - 1
        ? remaining
        : Number((BigInt(requestedPackages) * p.grams) / totalG);
    share = Math.min(share, cap, remaining);
    if (share > 0) {
      assigned.set(p.batchId, share);
      remaining -= share;
    }
  }

  if (remaining > 0) {
    const sorted = gramParts.slice().sort((a, b) => {
      const ra = rowByBatch.get(a.batchId);
      const rb = rowByBatch.get(b.batchId);
      const na = ra?.netTransitG ?? 0n;
      const nb = rb?.netTransitG ?? 0n;
      if (na < nb) {
        return 1;
      }
      if (na > nb) {
        return -1;
      }
      return a.batchId.localeCompare(b.batchId);
    });
    for (const p of sorted) {
      if (remaining <= 0) {
        break;
      }
      const cur = assigned.get(p.batchId) ?? 0;
      const cap = caps.get(p.batchId) ?? 0;
      const extra = Math.min(cap - cur, remaining);
      if (extra > 0) {
        assigned.set(p.batchId, cur + extra);
        remaining -= extra;
      }
    }
  }

  if (remaining > 0) {
    const allowed = requestedPackages - remaining;
    throw new Error(
      `При выбранных кг можно указать не больше ${allowed} ящ. — по партиям калибра остаток меньше`,
    );
  }

  return [...assigned.entries()]
    .filter(([, n]) => n > 0)
    .map(([batchId, packageCount]) => ({ batchId, packageCount }));
}

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
  packageCount?: number;
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

  if (input.packageCount !== undefined && input.packageCount > 0) {
    const pkgParts = allocateSellPackagesAcrossGramParts(gramParts, rows, input.batchById, input.packageCount);
    for (const part of pkgParts) {
      const chunk = chunks.find((c) => c.batchId === part.batchId);
      if (chunk) {
        chunk.packageCount = part.packageCount;
      }
    }
  }

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

/** Проверка плана продажи продавца (кг, ящики, лимиты по партиям) — текст для блокировки кнопки. */
export function sellerSellPlanBlockReason(input: {
  sellBatchId: string;
  sellableRows: TripBatchTableRow[];
  batchById: Map<string, BatchListItem>;
  kgRaw: string;
  priceRaw: string;
  packageCountRaw?: string;
  requirePackageCount: boolean;
  paymentKind: "cash" | "debt" | "mixed" | "card_transfer";
  cashKopecksMixed?: string;
  cardTransferKopecks?: string;
}): string | null {
  const kgNum = Number(input.kgRaw.replace(",", "."));
  if (!Number.isFinite(kgNum) || kgNum <= 0) {
    return null;
  }
  const priceNum = Number(input.priceRaw.replace(",", "."));
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return null;
  }
  let packageCount: number | undefined;
  if (input.requirePackageCount) {
    const raw = input.packageCountRaw?.trim() ?? "";
    if (!raw) {
      return null;
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    packageCount = n;
  }
  try {
    buildSellerSellChunks({
      sellBatchId: input.sellBatchId,
      sellableRows: input.sellableRows,
      batchById: input.batchById,
      kg: kgNum,
      pricePerKg: priceNum,
      paymentKind: input.paymentKind,
      cashKopecksMixed: input.cashKopecksMixed,
      cardTransferKopecks: input.cardTransferKopecks,
      packageCount,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Проверьте кг, ящики и цену";
  }
}
