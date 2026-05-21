import { eq } from "drizzle-orm";

import type {
  PurchaseLinePackageMeta,
  PurchaseLinePackageMetaPort,
} from "../../application/ports/purchase-line-package-meta.port.js";
import type { DbClient } from "../../db/client.js";
import { batches as batchesTable, purchaseDocumentLines } from "../../db/schema.js";

export class DrizzlePurchaseLinePackageMetaRepository implements PurchaseLinePackageMetaPort {
  constructor(private readonly db: DbClient) {}

  async findByBatchId(batchId: string): Promise<PurchaseLinePackageMeta | null> {
    const rows = await this.db
      .select({
        linePackageCount: purchaseDocumentLines.packageCount,
        purchasedGrams: batchesTable.totalGrams,
      })
      .from(purchaseDocumentLines)
      .innerJoin(batchesTable, eq(purchaseDocumentLines.batchId, batchesTable.id))
      .where(eq(purchaseDocumentLines.batchId, batchId))
      .limit(1);

    const r = rows[0];
    if (!r) {
      return null;
    }
    const pk = r.linePackageCount;
    if (pk == null || pk <= 0n || r.purchasedGrams <= 0n) {
      return null;
    }
    return { linePackageCount: pk, purchasedGrams: r.purchasedGrams };
  }
}
