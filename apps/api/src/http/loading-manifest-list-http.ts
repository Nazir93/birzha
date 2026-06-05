import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  productGrades,
  purchaseDocumentLines,
  shipDestinations,
  trips,
  warehouses,
} from "../db/schema.js";

export const loadingManifestsListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  scope: z.enum(["active", "archived", "all"]).optional(),
});

export type LoadingManifestListScope = z.infer<typeof loadingManifestsListQuerySchema>["scope"];

function formatPgDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function scopeWhere(scope: LoadingManifestListScope | undefined): SQL | undefined {
  if (scope === "archived") {
    return and(sql`${loadingManifests.tripId} IS NOT NULL`, eq(trips.status, "closed"));
  }
  if (scope === "active") {
    return or(
      sql`${loadingManifests.tripId} IS NULL`,
      sql`${trips.status} IS NULL`,
      sql`${trips.status} <> 'closed'`,
    );
  }
  return undefined;
}

function listWhere(search: string | undefined, scope: LoadingManifestListScope | undefined): SQL | undefined {
  const parts: SQL[] = [];
  const q = search?.trim();
  if (q) {
    parts.push(ilike(loadingManifests.manifestNumber, `%${q}%`));
  }
  const sw = scopeWhere(scope);
  if (sw) {
    parts.push(sw);
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return and(...parts);
}

type ManifestRow = {
  id: string;
  manifestNumber: string;
  docDate: Date;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  destinationCode: string;
  destinationName: string;
  tripId: string | null;
  createdAt: Date;
};

async function enrichManifestRows(db: DbClient, rows: ManifestRow[]) {
  const manifestIds = rows.map((r) => r.id);
  const lineByManifest = new Map<
    string,
    { lineCount: number; sumGrams: bigint; sumPackages: bigint | null }
  >();
  const calibersByManifest = new Map<string, { label: string; kg: number; packagesApprox: number }[]>();

  if (manifestIds.length === 0) {
    return rows.map((r) => ({
      id: r.id,
      manifestNumber: r.manifestNumber,
      docDate: formatPgDate(r.docDate),
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      destinationCode: r.destinationCode,
      destinationName: r.destinationName,
      tripId: r.tripId,
      createdAt: r.createdAt.toISOString(),
      lineCount: 0,
      totalKg: 0,
      packagesApprox: null as number | null,
      calibers: [] as { label: string; kg: number; packagesApprox: number }[],
    }));
  }

  const lineAgg = await db
    .select({
      manifestId: loadingManifestLines.manifestId,
      lineCount: sql<number>`count(*)::int`,
      sumGrams: sql<bigint>`coalesce(sum(${loadingManifestLines.grams}), 0::bigint)`,
      sumPackages: sql<bigint | null>`sum(${loadingManifestLines.packageCount})`,
    })
    .from(loadingManifestLines)
    .where(inArray(loadingManifestLines.manifestId, manifestIds))
    .groupBy(loadingManifestLines.manifestId);

  for (const la of lineAgg) {
    lineByManifest.set(la.manifestId, {
      lineCount: la.lineCount,
      sumGrams: la.sumGrams,
      sumPackages: la.sumPackages,
    });
  }

  const caliberRaw = await db
    .select({
      manifestId: loadingManifestLines.manifestId,
      productGroup: productGrades.productGroup,
      productGradeCode: productGrades.code,
      sumGrams: sql<bigint>`coalesce(sum(${loadingManifestLines.grams}), 0::bigint)`,
      sumPackages: sql<bigint | null>`sum(${loadingManifestLines.packageCount})`,
    })
    .from(loadingManifestLines)
    .innerJoin(batches, eq(loadingManifestLines.batchId, batches.id))
    .leftJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
    .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
    .where(inArray(loadingManifestLines.manifestId, manifestIds))
    .groupBy(loadingManifestLines.manifestId, productGrades.productGroup, productGrades.code);

  for (const c of caliberRaw) {
    const label = `${c.productGroup?.trim() || "Товар"} · ${c.productGradeCode?.trim() || "—"}`;
    const kg = Number(c.sumGrams) / 1000;
    const pkg = c.sumPackages != null ? Number(c.sumPackages) : 0;
    const arr = calibersByManifest.get(c.manifestId) ?? [];
    arr.push({ label, kg, packagesApprox: pkg });
    calibersByManifest.set(c.manifestId, arr);
  }
  for (const arr of calibersByManifest.values()) {
    arr.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }

  return rows.map((r) => {
    const la = lineByManifest.get(r.id);
    const totalKg = la ? Number(la.sumGrams) / 1000 : 0;
    const packagesApprox = la?.sumPackages != null ? Number(la.sumPackages) : null;
    return {
      id: r.id,
      manifestNumber: r.manifestNumber,
      docDate: formatPgDate(r.docDate),
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      destinationCode: r.destinationCode,
      destinationName: r.destinationName,
      tripId: r.tripId,
      createdAt: r.createdAt.toISOString(),
      lineCount: la?.lineCount ?? 0,
      totalKg,
      packagesApprox,
      calibers: calibersByManifest.get(r.id) ?? [],
    };
  });
}

function baseSelect(db: DbClient) {
  return db
    .select({
      id: loadingManifests.id,
      manifestNumber: loadingManifests.manifestNumber,
      docDate: loadingManifests.docDate,
      warehouseId: loadingManifests.warehouseId,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      destinationCode: loadingManifests.destinationCode,
      destinationName: shipDestinations.displayName,
      tripId: loadingManifests.tripId,
      createdAt: loadingManifests.createdAt,
    })
    .from(loadingManifests)
    .innerJoin(warehouses, eq(loadingManifests.warehouseId, warehouses.id))
    .innerJoin(shipDestinations, eq(loadingManifests.destinationCode, shipDestinations.code))
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id));
}

export async function listLoadingManifestsForHttp(
  db: DbClient,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
    scope?: LoadingManifestListScope;
  },
): Promise<{
  loadingManifests: Awaited<ReturnType<typeof enrichManifestRows>>;
  listMeta: { limit: number; offset: number; hasMore: boolean; totalCount: number };
}> {
  const where = listWhere(options?.search, options?.scope);
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const countRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loadingManifests)
    .innerJoin(warehouses, eq(loadingManifests.warehouseId, warehouses.id))
    .innerJoin(shipDestinations, eq(loadingManifests.destinationCode, shipDestinations.code))
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id))
    .where(where);

  const totalCount = countRow[0]?.count ?? 0;

  let q = baseSelect(db);
  if (where) {
    q = q.where(where) as typeof q;
  }
  const rows = await q.orderBy(desc(loadingManifests.createdAt)).limit(limit).offset(offset);
  const items = await enrichManifestRows(db, rows);
  return {
    loadingManifests: items,
    listMeta: { limit, offset, hasMore: offset + rows.length < totalCount, totalCount },
  };
}
