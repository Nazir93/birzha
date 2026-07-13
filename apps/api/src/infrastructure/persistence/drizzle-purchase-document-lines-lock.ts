import { inArray } from "drizzle-orm";

import type { PurchaseDocumentLinesLockChecker } from "../../application/purchase/replace-purchase-document-lines.use-case.js";
import type { DbClient } from "../../db/client.js";
import { batchWarehouseWriteOffs, loadingManifestLines } from "../../db/schema.js";

/** Проверки блокировки правки строк ЗН: партия в ПН или журнал возвратов. */
export class DrizzlePurchaseDocumentLinesLockChecker implements PurchaseDocumentLinesLockChecker {
  constructor(private readonly db: DbClient) {}

  async batchIdsInLoadingManifests(batchIds: readonly string[]): Promise<string[]> {
    const ids = normalizedIds(batchIds);
    if (ids.length === 0) {
      return [];
    }
    return distinctBatchIdsFrom(
      await this.db
        .select({ batchId: loadingManifestLines.batchId })
        .from(loadingManifestLines)
        .where(inArray(loadingManifestLines.batchId, ids)),
    );
  }

  async batchIdsWithQualityRejectReturns(batchIds: readonly string[]): Promise<string[]> {
    const ids = normalizedIds(batchIds);
    if (ids.length === 0) {
      return [];
    }
    return distinctBatchIdsFrom(
      await this.db
        .select({ batchId: batchWarehouseWriteOffs.batchId })
        .from(batchWarehouseWriteOffs)
        .where(inArray(batchWarehouseWriteOffs.batchId, ids)),
    );
  }
}

function normalizedIds(batchIds: readonly string[]): string[] {
  return [...new Set(batchIds.map((id) => id.trim()).filter(Boolean))];
}

function distinctBatchIdsFrom(rows: { batchId: string }[]): string[] {
  return [...new Set(rows.map((r) => r.batchId))];
}

/** Для in-memory HTTP-тестов без PostgreSQL: нет ПН и журнала возвратов. */
export const emptyPurchaseDocumentLinesLockChecker: PurchaseDocumentLinesLockChecker = {
  async batchIdsInLoadingManifests() {
    return [];
  },
  async batchIdsWithQualityRejectReturns() {
    return [];
  },
};
