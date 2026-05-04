import type { FastifyInstance } from "fastify";
import {
  assignLoadingManifestTripBodySchema,
  createLoadingManifestBodySchema,
} from "@birzha/contracts";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { DbClient } from "../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  productGrades,
  purchaseDocumentLines,
  purchaseDocuments,
  shipDestinations,
  warehouses,
} from "../db/schema.js";
import { assertActiveShipDestination } from "./register-ship-destination-routes.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtUser = { sub: string; roles: AuthRoleGrant[] };

function formatPgDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function packageCountForShelf(totalGrams: bigint, onWarehouseGrams: bigint, linePackageCount: bigint | null): bigint | null {
  if (linePackageCount == null || linePackageCount <= 0n || totalGrams <= 0n || onWarehouseGrams <= 0n) {
    return null;
  }
  return (onWarehouseGrams * linePackageCount + totalGrams / 2n) / totalGrams;
}

export function registerLoadingManifestRoutes(
  app: FastifyInstance,
  db: DbClient,
  routeAuth: BusinessRouteAuth,
): void {
  app.post("/loading-manifests", { ...withPreHandlers(routeAuth.ship) }, async (req, reply) => {
    try {
      const body = createLoadingManifestBodySchema.parse(req.body);
      const id = body.id?.trim() || crypto.randomUUID();
      const batchIds = [...new Set(body.batchIds.map((x) => x.trim()).filter(Boolean))];
      if (batchIds.length === 0) {
        return reply.code(400).send({ error: "empty_manifest" });
      }
      const destinationOk = await assertActiveShipDestination(db, body.destinationCode);
      if (!destinationOk) {
        return reply.code(400).send({ error: "invalid_ship_destination" });
      }
      const user = req.user as JwtUser | undefined;

      const selected = await db
        .select({
          batchId: batches.id,
          warehouseId: batches.warehouseId,
          totalGrams: batches.totalGrams,
          onWarehouseGrams: batches.onWarehouseGrams,
          destination: batches.destination,
          linePackageCount: purchaseDocumentLines.packageCount,
        })
        .from(batches)
        .leftJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
        .where(inArray(batches.id, batchIds));

      if (selected.length !== batchIds.length) {
        return reply.code(400).send({ error: "unknown_batch_in_manifest" });
      }
      const badWarehouse = selected.find((r) => r.warehouseId !== body.warehouseId);
      if (badWarehouse) {
        return reply.code(400).send({ error: "batch_not_in_warehouse", batchId: badWarehouse.batchId });
      }
      const noStock = selected.find((r) => r.onWarehouseGrams <= 0n);
      if (noStock) {
        return reply.code(400).send({ error: "batch_without_stock", batchId: noStock.batchId });
      }

      await db.transaction(async (tx) => {
        const exec = tx as unknown as DbClient;
        await exec.insert(loadingManifests).values({
          id,
          manifestNumber: body.manifestNumber,
          docDate: new Date(`${body.docDate}T00:00:00.000Z`),
          warehouseId: body.warehouseId,
          destinationCode: body.destinationCode,
          createdByUserId: user?.sub ?? null,
        });
        for (let i = 0; i < selected.length; i++) {
          const row = selected[i]!;
          await exec.insert(loadingManifestLines).values({
            manifestId: id,
            batchId: row.batchId,
            lineNo: i + 1,
            grams: row.onWarehouseGrams,
            packageCount: packageCountForShelf(row.totalGrams, row.onWarehouseGrams, row.linePackageCount),
          });
          if (row.destination !== body.destinationCode) {
            await exec.update(batches).set({ destination: body.destinationCode }).where(eq(batches.id, row.batchId));
          }
        }
      });

      return reply.code(201).send({ manifestId: id });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/loading-manifests/:manifestId", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const params = z.object({ manifestId: z.string().min(1) }).parse(req.params);
      const rows = await db
        .select({
          manifest: loadingManifests,
          warehouseName: warehouses.name,
          warehouseCode: warehouses.code,
          destinationName: shipDestinations.displayName,
          line: loadingManifestLines,
          purchaseDocumentNumber: purchaseDocuments.documentNumber,
          productGradeCode: productGrades.code,
          productGroup: productGrades.productGroup,
        })
        .from(loadingManifests)
        .innerJoin(warehouses, eq(loadingManifests.warehouseId, warehouses.id))
        .innerJoin(shipDestinations, eq(loadingManifests.destinationCode, shipDestinations.code))
        .innerJoin(loadingManifestLines, eq(loadingManifests.id, loadingManifestLines.manifestId))
        .innerJoin(batches, eq(loadingManifestLines.batchId, batches.id))
        .leftJoin(purchaseDocumentLines, eq(loadingManifestLines.batchId, purchaseDocumentLines.batchId))
        .leftJoin(purchaseDocuments, eq(purchaseDocumentLines.documentId, purchaseDocuments.id))
        .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
        .where(eq(loadingManifests.id, params.manifestId));

      if (rows.length === 0) {
        return reply.code(404).send({ error: "loading_manifest_not_found" });
      }
      const h = rows[0]!;
      return reply.send({
        manifest: {
          id: h.manifest.id,
          manifestNumber: h.manifest.manifestNumber,
          docDate: formatPgDate(h.manifest.docDate),
          warehouseId: h.manifest.warehouseId,
          warehouseName: h.warehouseName,
          warehouseCode: h.warehouseCode,
          destinationCode: h.manifest.destinationCode,
          destinationName: h.destinationName,
          tripId: h.manifest.tripId,
          createdAt: h.manifest.createdAt.toISOString(),
          lines: rows
            .map((r) => ({
              lineNo: r.line.lineNo,
              batchId: r.line.batchId,
              grams: r.line.grams.toString(),
              kg: Number(r.line.grams) / 1000,
              packageCount: r.line.packageCount?.toString() ?? null,
              purchaseDocumentNumber: r.purchaseDocumentNumber,
              productGradeCode: r.productGradeCode,
              productGroup: r.productGroup,
            }))
            .sort((a, b) => a.lineNo - b.lineNo),
        },
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/loading-manifests/:manifestId/assign-trip", { ...withPreHandlers(routeAuth.ship) }, async (req, reply) => {
    try {
      const params = z.object({ manifestId: z.string().min(1) }).parse(req.params);
      const body = assignLoadingManifestTripBodySchema.parse(req.body);
      const [row] = await db
        .update(loadingManifests)
        .set({ tripId: body.tripId })
        .where(eq(loadingManifests.id, params.manifestId))
        .returning({ id: loadingManifests.id });
      if (!row) {
        return reply.code(404).send({ error: "loading_manifest_not_found" });
      }
      return reply.send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
