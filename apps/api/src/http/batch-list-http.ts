import { eq, inArray } from "drizzle-orm";

import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { DbClient } from "../db/client.js";
import { batches as batchesTable, productGrades, purchaseDocumentLines, purchaseDocuments } from "../db/schema.js";

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
      warehouseId: purchaseDocuments.warehouseId,
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
      warehouseId: string | null;
      productGradeCode: string | null;
      productGroup: string | null;
      documentNumber: string | null;
    }
  >();
  for (const r of rows) {
    meta.set(r.batchId, {
      documentId: r.documentId,
      warehouseId: r.warehouseId,
      productGradeCode: r.productGradeCode,
      productGroup: r.productGroup,
      documentNumber: r.documentNumber,
    });
  }

  const br = await db
    .select({ id: batchesTable.id, qualityTier: batchesTable.qualityTier, destination: batchesTable.destination })
    .from(batchesTable)
    .where(inArray(batchesTable.id, ids));
  const alloc = new Map<string, { qualityTier: string | null; destination: string | null }>();
  for (const r of br) {
    alloc.set(r.id, { qualityTier: r.qualityTier, destination: r.destination });
  }

  return list.map((b) => {
    const id = b.getId();
    const m = meta.get(id);
    const a = alloc.get(id);
    return batchToJson(
      b,
      m
        ? {
            documentId: m.documentId,
            warehouseId: m.warehouseId,
            productGradeCode: m.productGradeCode,
            productGroup: m.productGroup,
            documentNumber: m.documentNumber,
          }
        : undefined,
      a ? { qualityTier: a.qualityTier, destination: a.destination } : undefined,
    );
  });
}
