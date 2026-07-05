import { and, desc, eq, exists, gt, inArray, isNull, notExists, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import { batches, purchaseDocumentLines, purchaseDocuments } from "../db/schema.js";

export const purchaseDocumentsListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  scope: z.enum(["inWork", "archived", "all"]).optional(),
});

export type PurchaseDocumentListScope = z.infer<typeof purchaseDocumentsListQuerySchema>["scope"];

const batchHasStock = or(
  gt(batches.pendingInboundGrams, 0n),
  gt(batches.onWarehouseGrams, 0n),
  gt(batches.inTransitGrams, 0n),
);

function remainingStockSubquery(db: DbClient) {
  return db
    .select({ one: sql<number>`1` })
    .from(purchaseDocumentLines)
    .innerJoin(batches, eq(purchaseDocumentLines.batchId, batches.id))
    .where(and(eq(purchaseDocumentLines.documentId, purchaseDocuments.id), batchHasStock));
}

function linesSubquery(db: DbClient) {
  return db
    .select({ one: sql<number>`1` })
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.documentId, purchaseDocuments.id));
}

function documentHasLines(db: DbClient) {
  return exists(linesSubquery(db));
}

function documentHasRemainingStock(db: DbClient) {
  return exists(remainingStockSubquery(db));
}

function scopeWhere(db: DbClient, scope: PurchaseDocumentListScope | undefined): SQL | undefined {
  if (scope === "archived") {
    return and(documentHasLines(db), notExists(remainingStockSubquery(db)));
  }
  if (scope === "inWork") {
    return or(notExists(linesSubquery(db)), documentHasRemainingStock(db));
  }
  return undefined;
}

function formatPgDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function listPurchaseDocumentsForHttp(
  db: DbClient,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
    scope?: PurchaseDocumentListScope;
    warehouseIds?: readonly string[];
    purchaserUserId?: string;
  },
) {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const parts: SQL[] = [];
  const q = options?.search?.trim();
  if (q) {
    parts.push(sql`${purchaseDocuments.documentNumber} ilike ${`%${q}%`}`);
  }
  const sw = scopeWhere(db, options?.scope);
  if (sw) {
    parts.push(sw);
  }
  if (options?.warehouseIds && options.warehouseIds.length > 0) {
    parts.push(inArray(purchaseDocuments.warehouseId, [...options.warehouseIds]));
  }
  if (options?.purchaserUserId) {
    const purchaserFilter = or(
      isNull(purchaseDocuments.createdByUserId),
      eq(purchaseDocuments.createdByUserId, options.purchaserUserId),
    );
    if (purchaserFilter) {
      parts.push(purchaserFilter);
    }
  }
  const where = parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : and(...parts);

  const countRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseDocuments)
    .where(where);

  const totalCount = countRow[0]?.count ?? 0;

  let query = db
    .select({
      id: purchaseDocuments.id,
      documentNumber: purchaseDocuments.documentNumber,
      docDate: purchaseDocuments.docDate,
      warehouseId: purchaseDocuments.warehouseId,
      createdByUserId: purchaseDocuments.createdByUserId,
    })
    .from(purchaseDocuments)
    .orderBy(desc(purchaseDocuments.docDate), desc(purchaseDocuments.documentNumber))
    .limit(limit)
    .offset(offset);

  if (where) {
    query = query.where(where) as typeof query;
  }

  const rows = await query;

  const ids = rows.map((r) => r.id);
  const lineCounts =
    ids.length === 0
      ? []
      : await db
          .select({
            documentId: purchaseDocumentLines.documentId,
            c: sql<number>`count(*)::int`,
          })
          .from(purchaseDocumentLines)
          .where(inArray(purchaseDocumentLines.documentId, ids))
          .groupBy(purchaseDocumentLines.documentId);

  const countMap = new Map(lineCounts.map((r) => [r.documentId, r.c]));

  return {
    purchaseDocuments: rows.map((d) => ({
      id: d.id,
      documentNumber: d.documentNumber,
      docDate: formatPgDate(d.docDate),
      warehouseId: d.warehouseId,
      lineCount: countMap.get(d.id) ?? 0,
      createdByUserId: d.createdByUserId ?? null,
    })),
    listMeta: {
      limit,
      offset,
      hasMore: offset + rows.length < totalCount,
      totalCount,
    },
  };
}
