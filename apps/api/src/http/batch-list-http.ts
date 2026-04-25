import { eq, inArray } from "drizzle-orm";

import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { DbClient } from "../db/client.js";
import { gramsToKg } from "../infrastructure/persistence/batch-mass.js";
import { DrizzleBatchWarehouseWriteOffLedger } from "../infrastructure/persistence/drizzle-batch-warehouse-write-off-ledger.js";
import { batches as batchesTable, productGrades, purchaseDocumentLines, purchaseDocuments } from "../db/schema.js";

import type { Batch } from "@birzha/domain";

import { type BatchJson, batchToJson } from "./batch-serialize.js";

type LineMeta = {
  documentId: string | null;
  warehouseId: string | null;
  productGradeCode: string | null;
  productGroup: string | null;
  documentNumber: string | null;
  linePackageCount: number | null;
};

/** Склад для группировки в «Распределении»: из накладной, иначе с колонки партий (всё, что пришло с приёмов). */
function mergeNakladnyaForList(m: LineMeta | undefined, b: Batch): BatchJson["nakladnaya"] | undefined {
  const wJoin = m?.warehouseId != null && String(m.warehouseId).trim() !== "" ? String(m.warehouseId).trim() : null;
  const wBatch = b.getWarehouseId();
  const w = wJoin ?? wBatch;
  if (!m && w == null) {
    return undefined;
  }
  if (!m && w != null) {
    return {
      documentId: null,
      warehouseId: w,
      productGradeCode: null,
      productGroup: null,
      documentNumber: null,
      linePackageCount: null,
    };
  }
  if (!m) {
    return undefined;
  }
  return {
    documentId: m.documentId,
    warehouseId: w,
    productGradeCode: m.productGradeCode,
    productGroup: m.productGroup,
    documentNumber: m.documentNumber,
    linePackageCount: m.linePackageCount,
  };
}

export async function listBatchesForHttp(batches: BatchRepository, db: DbClient | null): Promise<BatchJson[]> {
  const list = await batches.list();
  if (list.length === 0) {
    return list.map((b) => batchToJson(b, mergeNakladnyaForList(undefined, b), undefined));
  }

  let rejectByBatch = new Map<string, bigint>();
  if (db) {
    const ledger = new DrizzleBatchWarehouseWriteOffLedger(db);
    const ids0 = list.map((b) => b.getId());
    rejectByBatch = await ledger.totalQualityRejectGramsByBatchIds(ids0);
  }

  if (!db) {
    return list.map((b) => batchToJson(b, mergeNakladnyaForList(undefined, b), undefined));
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
      linePackageCount: purchaseDocumentLines.packageCount,
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
      linePackageCount: number | null;
    }
  >();
  for (const r of rows) {
    const pk = r.linePackageCount;
    meta.set(r.batchId, {
      documentId: r.documentId,
      warehouseId: r.warehouseId,
      productGradeCode: r.productGradeCode,
      productGroup: r.productGroup,
      documentNumber: r.documentNumber,
      linePackageCount: pk != null ? Number(pk) : null,
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
    const rg = rejectByBatch.get(id) ?? 0n;
    return batchToJson(
      b,
      mergeNakladnyaForList(m, b),
      a ? { qualityTier: a.qualityTier, destination: a.destination } : undefined,
      { qualityRejectWrittenOffKg: gramsToKg(rg) },
    );
  });
}
