import { eq, inArray } from "drizzle-orm";

import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { DbClient } from "../db/client.js";
import { productGrades, purchaseDocumentLines, purchaseDocuments } from "../db/schema.js";

import { type BatchJson, batchToJson } from "./batch-serialize.js";

export async function listBatchesForHttp(batches: BatchRepository, db: DbClient | null): Promise<BatchJson[]> {
  const list = await batches.list();
  if (!db || list.length === 0) {
    return list.map((b) => batchToJson(b));
  }

  const ids = list.map((b) => b.getId());
  const rows = await db
    .select({
      batchId: purchaseDocumentLines.batchId,
      productGradeCode: productGrades.code,
      documentNumber: purchaseDocuments.documentNumber,
    })
    .from(purchaseDocumentLines)
    .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
    .leftJoin(purchaseDocuments, eq(purchaseDocumentLines.documentId, purchaseDocuments.id))
    .where(inArray(purchaseDocumentLines.batchId, ids));

  const meta = new Map<string, { productGradeCode: string | null; documentNumber: string | null }>();
  for (const r of rows) {
    meta.set(r.batchId, {
      productGradeCode: r.productGradeCode,
      documentNumber: r.documentNumber,
    });
  }

  return list.map((b) => {
    const id = b.getId();
    const m = meta.get(id);
    return batchToJson(
      b,
      m ? { productGradeCode: m.productGradeCode, documentNumber: m.documentNumber } : undefined,
    );
  });
}
