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
      documentId: purchaseDocuments.id,
      productGradeCode: productGrades.code,
      productGroup: productGrades.productGroup,
      documentNumber: purchaseDocuments.documentNumber,
    })
    .from(purchaseDocumentLines)
    .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
    .leftJoin(purchaseDocuments, eq(purchaseDocumentLines.documentId, purchaseDocuments.id))
    .where(inArray(purchaseDocumentLines.batchId, ids));

  const meta = new Map<
    string,
    {
      documentId: string | null;
      productGradeCode: string | null;
      productGroup: string | null;
      documentNumber: string | null;
    }
  >();
  for (const r of rows) {
    meta.set(r.batchId, {
      documentId: r.documentId,
      productGradeCode: r.productGradeCode,
      productGroup: r.productGroup,
      documentNumber: r.documentNumber,
    });
  }

  return list.map((b) => {
    const id = b.getId();
    const m = meta.get(id);
    return batchToJson(
      b,
      m
        ? {
            documentId: m.documentId,
            productGradeCode: m.productGradeCode,
            productGroup: m.productGroup,
            documentNumber: m.documentNumber,
          }
        : undefined,
    );
  });
}
