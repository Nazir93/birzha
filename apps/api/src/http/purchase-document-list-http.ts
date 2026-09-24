import { and, desc, eq, exists, gt, inArray, notExists, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import { batches, purchaseDocumentLines, purchaseDocuments, warehouses } from "../db/schema.js";
import { gramsToKg } from "../application/units/mass.js";

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

function asBigInt(value: bigint | string | number | null | undefined): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value.trim());
  }
  return 0n;
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
    parts.push(
      sql`(
        ${purchaseDocuments.documentNumber} ilike ${`%${q}%`}
        or coalesce(${purchaseDocuments.supplierName}, '') ilike ${`%${q}%`}
      )`,
    );
  }
  const sw = scopeWhere(db, options?.scope);
  if (sw) {
    parts.push(sw);
  }
  if (options?.warehouseIds && options.warehouseIds.length > 0) {
    parts.push(inArray(purchaseDocuments.warehouseId, [...options.warehouseIds]));
  }
  if (options?.purchaserUserId) {
    const uid = options.purchaserUserId;
    const purchaserFilter = sql`(
      coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId}) is null
      or coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId}) = ${uid}
    )`;
    parts.push(purchaserFilter);
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
      warehouseName: warehouses.name,
      supplierName: purchaseDocuments.supplierName,
      supplierId: purchaseDocuments.supplierId,
      extraCostKopecks: purchaseDocuments.extraCostKopecks,
      createdByUserId: purchaseDocuments.createdByUserId,
      purchaserUserId: purchaseDocuments.purchaserUserId,
    })
    .from(purchaseDocuments)
    .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
    .orderBy(desc(purchaseDocuments.docDate), desc(purchaseDocuments.documentNumber))
    .limit(limit)
    .offset(offset);

  if (where) {
    query = query.where(where) as typeof query;
  }

  const rows = await query;

  const ids = rows.map((r) => r.id);
  const lineAggs =
    ids.length === 0
      ? []
      : await db
          .select({
            documentId: purchaseDocumentLines.documentId,
            lineCount: sql<number>`count(*)::int`,
            linesTotalKopecks: sql<string>`coalesce(sum(${purchaseDocumentLines.lineTotalKopecks}), 0)::text`,
            totalGrams: sql<string>`coalesce(sum(${purchaseDocumentLines.quantityGrams}), 0)::text`,
          })
          .from(purchaseDocumentLines)
          .where(inArray(purchaseDocumentLines.documentId, ids))
          .groupBy(purchaseDocumentLines.documentId);

  const aggMap = new Map(
    lineAggs.map((r) => [
      r.documentId,
      {
        lineCount: r.lineCount,
        linesTotalKopecks: asBigInt(r.linesTotalKopecks),
        totalGrams: asBigInt(r.totalGrams),
      },
    ]),
  );

  return {
    purchaseDocuments: rows.map((d) => {
      const agg = aggMap.get(d.id);
      const linesTotal = agg?.linesTotalKopecks ?? 0n;
      const extra = asBigInt(d.extraCostKopecks);
      return {
        id: d.id,
        documentNumber: d.documentNumber,
        docDate: formatPgDate(d.docDate),
        warehouseId: d.warehouseId,
        warehouseName: d.warehouseName?.trim() || "—",
        supplierId: d.supplierId ?? null,
        supplierName: d.supplierName?.trim() || null,
        lineCount: agg?.lineCount ?? 0,
        totalKg: gramsToKg(agg?.totalGrams ?? 0n),
        linesTotalKopecks: linesTotal.toString(),
        extraCostKopecks: extra.toString(),
        documentTotalKopecks: (linesTotal + extra).toString(),
        createdByUserId: d.createdByUserId ?? null,
        purchaserUserId: d.purchaserUserId ?? null,
      };
    }),
    listMeta: {
      limit,
      offset,
      hasMore: offset + rows.length < totalCount,
      totalCount,
    },
  };
}
