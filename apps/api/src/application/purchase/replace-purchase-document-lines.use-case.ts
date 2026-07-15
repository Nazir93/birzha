import { randomUUID } from "node:crypto";

import { Batch } from "@birzha/domain";
import {
  type ReplacePurchaseDocumentLinesBody,
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import {
  ProductGradeNotFoundError,
  PurchaseDocumentLinesLockedError,
  PurchaseDocumentNotFoundError,
  PurchaseLineTotalMismatchError,
} from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { ProductGradeRepository } from "../ports/product-grade-repository.port.js";
import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentRepository,
} from "../ports/purchase-document-repository.port.js";
import { resolvePurchaseLineMass } from "./resolve-purchase-line-mass.js";

function expectedLineKopecks(totalKg: number, pricePerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(totalKg, 6),
    numberToDecimalStringForKopecks(pricePerKg, 4),
  );
}

function lineTotalsMatch(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= 1;
}

function batchFullyOnWarehouse(batch: Batch): boolean {
  const s = batch.toPersistenceState();
  return (
    s.pendingInboundGrams === 0n &&
    s.inTransitGrams === 0n &&
    s.soldGrams === 0n &&
    s.writtenOffGrams === 0n &&
    s.onWarehouseGrams === s.totalGrams
  );
}

export type PurchaseDocumentLinesLockChecker = {
  batchIdsInLoadingManifests(batchIds: readonly string[]): Promise<string[]>;
  batchIdsWithQualityRejectReturns(batchIds: readonly string[]): Promise<string[]>;
};

export type PurchaseDocumentLinesEditability =
  | { editable: true }
  | { editable: false; reason: "in_loading_manifest" | "batch_moved" };

/** Можно ли править строки ЗН: нет партий в ПН и нет движений/возвратов. */
export async function evaluatePurchaseDocumentLinesEditability(
  _documentId: string,
  batchIds: readonly string[],
  batches: BatchRepository,
  locks: PurchaseDocumentLinesLockChecker,
): Promise<PurchaseDocumentLinesEditability> {
  if (batchIds.length === 0) {
    return { editable: true };
  }
  const inManifest = await locks.batchIdsInLoadingManifests(batchIds);
  if (inManifest.length > 0) {
    return { editable: false, reason: "in_loading_manifest" };
  }
  const withReturns = await locks.batchIdsWithQualityRejectReturns(batchIds);
  if (withReturns.length > 0) {
    return { editable: false, reason: "batch_moved" };
  }
  for (const batchId of batchIds) {
    const batch = await batches.findById(batchId);
    if (!batch || !batchFullyOnWarehouse(batch)) {
      return { editable: false, reason: "batch_moved" };
    }
  }
  return { editable: true };
}

/**
 * Полная замена строк закупочной накладной (правка «как Excel») до попадания партий в ПН.
 */
export class ReplacePurchaseDocumentLinesUseCase {
  constructor(
    private readonly purchaseDocuments: PurchaseDocumentRepository,
    private readonly grades: ProductGradeRepository,
    private readonly batches: BatchRepository,
    private readonly locks: PurchaseDocumentLinesLockChecker,
  ) {}

  async execute(documentId: string, body: ReplacePurchaseDocumentLinesBody): Promise<void> {
    const id = documentId.trim();
    const detail = await this.purchaseDocuments.findByIdWithLines(id);
    if (!detail) {
      throw new PurchaseDocumentNotFoundError(id);
    }

    const existingBatchIds = detail.lines.map((l) => l.batchId);
    const editability = await evaluatePurchaseDocumentLinesEditability(
      id,
      existingBatchIds,
      this.batches,
      this.locks,
    );
    if (!editability.editable) {
      throw new PurchaseDocumentLinesLockedError(id, editability.reason);
    }

    const existingByBatch = new Map(detail.lines.map((l) => [l.batchId, l]));
    const keptBatchIds = new Set<string>();
    const lines: NewPurchaseDocumentLine[] = [];

    for (let i = 0; i < body.lines.length; i++) {
      const row = body.lines[i]!;
      const grade = await this.grades.findById(row.productGradeId);
      if (!grade) {
        throw new ProductGradeNotFoundError(row.productGradeId);
      }

      const mass = resolvePurchaseLineMass({
        grossKg: row.grossKg,
        packageCount: row.packageCount,
      });
      const expected = expectedLineKopecks(mass.netKg, row.pricePerKg);
      if (!lineTotalsMatch(expected, row.lineTotalKopecks)) {
        throw new PurchaseLineTotalMismatchError(i, expected, row.lineTotalKopecks);
      }

      const pricePerKgNumeric = row.pricePerKg.toFixed(6);
      const lineTotalKopecks = BigInt(row.lineTotalKopecks);

      const keepId = row.batchId?.trim() || "";
      if (keepId) {
        if (!existingByBatch.has(keepId)) {
          throw new PurchaseDocumentLinesLockedError(id, "batch_moved");
        }
        if (keptBatchIds.has(keepId)) {
          throw new PurchaseDocumentLinesLockedError(id, "batch_moved");
        }
        keptBatchIds.add(keepId);
        const batch = Batch.create({
          id: keepId,
          purchaseId: id,
          totalKg: mass.netKg,
          pricePerKg: row.pricePerKg,
          distribution: "on_hand",
          warehouseId: detail.warehouseId,
        });
        lines.push({
          id: randomUUID(),
          lineNo: i + 1,
          productGradeId: row.productGradeId,
          quantityGrams: mass.netGrams,
          grossQuantityGrams: mass.grossGrams,
          packageCount: mass.packageCount,
          pricePerKgNumeric,
          lineTotalKopecks,
          batch,
        });
        continue;
      }

      const batchId = randomUUID();
      const batch = Batch.create({
        id: batchId,
        purchaseId: id,
        totalKg: mass.netKg,
        pricePerKg: row.pricePerKg,
        distribution: "on_hand",
        warehouseId: detail.warehouseId,
      });
      lines.push({
        id: randomUUID(),
        lineNo: i + 1,
        productGradeId: row.productGradeId,
        quantityGrams: mass.netGrams,
        grossQuantityGrams: mass.grossGrams,
        packageCount: mass.packageCount,
        pricePerKgNumeric,
        lineTotalKopecks,
        batch,
      });
    }

    await this.purchaseDocuments.replaceDocumentLines(id, lines);
  }
}
