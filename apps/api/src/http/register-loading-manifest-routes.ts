import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import {
  appendLoadingManifestBatchesBodySchema,
  assignLoadingManifestTripBodySchema,
  createLoadingManifestBodySchema,
  loadingManifestReservedBatchIdsQuerySchema,
  updateLoadingManifestHeaderBodySchema,
} from "@birzha/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import { planLoadingManifestAssignTripShipment } from "../application/trip/loading-manifest-assign-trip-ship.plan.js";
import { classifyLoadingManifestAssignRequest } from "../application/trip/loading-manifest-assign-request.js";
import { assertTripAllowsWarehouseLoading } from "../application/trip/assert-trip-warehouse-loading.js";
import {
  loadingManifestTripAssignLock,
  loadingManifestTripAssignLockMessage,
} from "../application/trip/loading-manifest-trip-assign-lock.js";
import { DeleteLoadingManifestUseCase } from "../application/trip/delete-loading-manifest.use-case.js";
import { UpdateLoadingManifestHeaderUseCase } from "../application/trip/update-loading-manifest-header.use-case.js";
import { ShipToTripUseCase } from "../application/trip/ship-to-trip.use-case.js";
import type { DbClient } from "../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  productGrades,
  purchaseDocumentLines,
  purchaseDocuments,
  shipDestinations,
  tripBatchShipments,
  trips,
  warehouses,
} from "../db/schema.js";
import { assertActiveShipDestination } from "./register-ship-destination-routes.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";
import { DrizzleBatchRepository } from "../infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleTripShipmentRepository } from "../infrastructure/persistence/drizzle-trip-shipment.repository.js";
import {
  listLoadingManifestsForHttp,
  loadingManifestsListQuerySchema,
} from "./loading-manifest-list-http.js";

type JwtUser = { sub: string; roles: AuthRoleGrant[] };

function formatPgDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toBigIntOrZero(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) {
      return 0n;
    }
    try {
      return BigInt(t);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function toNullableBigInt(value: unknown): bigint | null {
  if (value == null) {
    return null;
  }
  return toBigIntOrZero(value);
}

function packageCountForShelf(totalGrams: bigint, onWarehouseGrams: bigint, linePackageCount: bigint | null): bigint | null {
  if (linePackageCount == null || linePackageCount <= 0n || totalGrams <= 0n || onWarehouseGrams <= 0n) {
    return null;
  }
  return (onWarehouseGrams * linePackageCount + totalGrams / 2n) / totalGrams;
}

function packageCountForPart(totalGrams: bigint, partGrams: bigint, linePackageCount: bigint | null): bigint | null {
  if (linePackageCount == null || linePackageCount <= 0n || totalGrams <= 0n || partGrams <= 0n) {
    return null;
  }
  return (partGrams * linePackageCount + totalGrams / 2n) / totalGrams;
}

export function registerLoadingManifestRoutes(
  app: FastifyInstance,
  db: DbClient,
  routeAuth: BusinessRouteAuth,
  /** Для POST assign-trip: синхронизация отгрузки в рейс по строкам ПН (иначе только запись trip_id). */
  tripRead?: TripRepository,
): void {
  const deleteLoadingManifest = new DeleteLoadingManifestUseCase(db);
  const updateLoadingManifestHeader = new UpdateLoadingManifestHeaderUseCase(db);
  app.post("/loading-manifests", { ...withPreHandlers(routeAuth.ship) }, async (req, reply) => {
    try {
      const body = createLoadingManifestBodySchema.parse(req.body);
      const id = body.id?.trim() || crypto.randomUUID();
      const batchIds: string[] = [...new Set(body.batchIds.map((x: string) => x.trim()).filter(Boolean))];
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

  app.get("/loading-manifests", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const raw = req.query as Record<string, string | undefined>;
      const parsed = loadingManifestsListQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_query", issues: parsed.error.flatten() });
      }
      const d = parsed.data;
      const payload = await listLoadingManifestsForHttp(db, {
        search: d.search,
        limit: d.limit ?? 100,
        offset: d.offset ?? 0,
        scope: d.scope,
      });
      return reply.send(payload);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/loading-manifests/reserved-batch-ids", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const q = loadingManifestReservedBatchIdsQuerySchema.parse(req.query);
      const rows = await db
        .select({ batchId: loadingManifestLines.batchId })
        .from(loadingManifestLines)
        .innerJoin(loadingManifests, eq(loadingManifests.id, loadingManifestLines.manifestId))
        .where(eq(loadingManifests.warehouseId, q.warehouseId))
        .groupBy(loadingManifestLines.batchId);
      return reply.send({ batchIds: rows.map((r) => r.batchId) });
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
          onWarehouseGrams: batches.onWarehouseGrams,
          inTransitGrams: batches.inTransitGrams,
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
      const lineMasses = rows.map((r) => ({
        onWarehouseGrams: r.onWarehouseGrams,
        inTransitGrams: r.inTransitGrams,
      }));
      const assignLock = loadingManifestTripAssignLock({
        tripId: h.manifest.tripId,
        lineMasses,
      });
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
          tripAssignLocked: assignLock.locked,
          tripAssignLockedReason: assignLock.code ?? null,
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
      const manifestId = params.manifestId;

      const [existing] = await db
        .select({ tripId: loadingManifests.tripId })
        .from(loadingManifests)
        .where(eq(loadingManifests.id, manifestId))
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: "loading_manifest_not_found" });
      }
      const assignDecision = classifyLoadingManifestAssignRequest({
        existingTripId: existing.tripId,
        requestedTripId: body.tripId,
      });
      if (assignDecision === "idempotent") {
        return reply.send({ ok: true });
      }
      if (assignDecision === "change_forbidden") {
        return reply.code(400).send({
          error: "loading_manifest_trip_change_forbidden",
          message: loadingManifestTripAssignLockMessage("already_assigned"),
        });
      }

      const lineMassRows = await db
        .select({
          onWarehouseGrams: batches.onWarehouseGrams,
          inTransitGrams: batches.inTransitGrams,
        })
        .from(loadingManifestLines)
        .innerJoin(batches, eq(loadingManifestLines.batchId, batches.id))
        .where(eq(loadingManifestLines.manifestId, manifestId));

      const assignLock = loadingManifestTripAssignLock({
        tripId: existing.tripId,
        lineMasses: lineMassRows,
      });
      if (assignLock.locked) {
        const code = assignLock.code ?? "already_assigned";
        return reply.code(400).send({
          error: "loading_manifest_trip_assign_forbidden",
          message: loadingManifestTripAssignLockMessage(code),
        });
      }

      const [manifestRow] = await db
        .select({ warehouseId: loadingManifests.warehouseId })
        .from(loadingManifests)
        .where(eq(loadingManifests.id, manifestId))
        .limit(1);
      if (!manifestRow) {
        return reply.code(404).send({ error: "loading_manifest_not_found" });
      }
      if (tripRead) {
        await assertTripAllowsWarehouseLoading(db, tripRead, {
          tripId: body.tripId,
          warehouseId: manifestRow.warehouseId,
        });
      }

      if (!tripRead) {
        await db
          .update(loadingManifests)
          .set({ tripId: body.tripId })
          .where(eq(loadingManifests.id, manifestId));
        return reply.send({ ok: true });
      }

      await db.transaction(async (tx) => {
        const exec = tx as unknown as DbClient;
        await exec
          .update(loadingManifests)
          .set({ tripId: body.tripId })
          .where(eq(loadingManifests.id, manifestId));

        const lines = await exec
          .select({
            batchId: loadingManifestLines.batchId,
            grams: loadingManifestLines.grams,
            packageCount: loadingManifestLines.packageCount,
          })
          .from(loadingManifestLines)
          .where(eq(loadingManifestLines.manifestId, manifestId));

        const batchRepo = new DrizzleBatchRepository(exec);
        const shipRepo = new DrizzleTripShipmentRepository(exec);
        const shipUse = new ShipToTripUseCase(batchRepo, tripRead, shipRepo, undefined);

        for (const line of lines) {
          const ledger = await shipRepo.totalGramsForTripAndBatch(body.tripId, line.batchId);
          const [linePkgAgg] = await exec
            .select({
              totalPackageCount: sql<bigint>`coalesce(sum(${tripBatchShipments.packageCount}), 0::bigint)`,
            })
            .from(tripBatchShipments)
            .where(
              and(
                eq(tripBatchShipments.tripId, body.tripId),
                eq(tripBatchShipments.batchId, line.batchId),
              ),
            );
          const [br] = await exec
            .select({
              onWarehouseGrams: batches.onWarehouseGrams,
              inTransitGrams: batches.inTransitGrams,
            })
            .from(batches)
            .where(eq(batches.id, line.batchId))
            .limit(1);
          const plan = planLoadingManifestAssignTripShipment({
            lineGrams: toBigIntOrZero(line.grams),
            linePackageCount: toNullableBigInt(line.packageCount),
            ledgerGramsForTripBatch: ledger,
            ledgerPackageCountForTripBatch: toBigIntOrZero(linePkgAgg?.totalPackageCount),
            onWarehouseGrams: br?.onWarehouseGrams ?? 0n,
            inTransitGrams: br?.inTransitGrams ?? 0n,
          });
          if (plan.kind === "none") {
            continue;
          }
          if (plan.kind === "ledger_append_in_transit") {
            await shipRepo.append({
              id: randomUUID(),
              tripId: body.tripId,
              batchId: line.batchId,
              grams: plan.grams,
              packageCount: plan.packageCount,
            });
            continue;
          }
          const kg = Number(plan.grams) / 1000;
          await shipUse.execute({
            batchId: line.batchId,
            tripId: body.tripId,
            kg,
            packageCount: plan.packageCount == null ? undefined : Number(plan.packageCount),
          });
        }
      });

      return reply.send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/loading-manifests/:manifestId/add-batches", { ...withPreHandlers(routeAuth.ship) }, async (req, reply) => {
    try {
      const params = z.object({ manifestId: z.string().min(1) }).parse(req.params);
      const body = appendLoadingManifestBatchesBodySchema.parse(req.body);
      const manifestId = params.manifestId;
      const batchIds: string[] = [...new Set(body.batchIds.map((x) => x.trim()).filter(Boolean))];
      if (batchIds.length === 0) {
        return reply.code(400).send({ error: "empty_manifest" });
      }

      const [manifest] = await db
        .select({
          id: loadingManifests.id,
          warehouseId: loadingManifests.warehouseId,
          destinationCode: loadingManifests.destinationCode,
          tripId: loadingManifests.tripId,
        })
        .from(loadingManifests)
        .where(eq(loadingManifests.id, manifestId))
        .limit(1);
      if (!manifest) {
        return reply.code(404).send({ error: "loading_manifest_not_found" });
      }
      let assignedTripId: string | null = manifest.tripId;
      if (manifest.tripId) {
        const [trip] = await db
          .select({ id: trips.id, status: trips.status, assignedSellerUserId: trips.assignedSellerUserId })
          .from(trips)
          .where(eq(trips.id, manifest.tripId))
          .limit(1);
        if (!trip) {
          return reply.code(400).send({ error: "trip_not_found", message: "Рейс не найден." });
        }
        if (trip.status === "closed") {
          return reply.code(400).send({
            error: "loading_manifest_trip_assign_forbidden",
            message: "Рейс уже закрыт — добавление в погрузочную недоступно.",
          });
        }
      }

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
      const badWarehouse = selected.find((r) => r.warehouseId !== manifest.warehouseId);
      if (badWarehouse) {
        return reply.code(400).send({ error: "batch_not_in_warehouse", batchId: badWarehouse.batchId });
      }
      const noStock = selected.find((r) => r.onWarehouseGrams <= 0n);
      if (noStock) {
        return reply.code(400).send({ error: "batch_without_stock", batchId: noStock.batchId });
      }

      const existingRows = await db
        .select({ batchId: loadingManifestLines.batchId, lineNo: loadingManifestLines.lineNo, grams: loadingManifestLines.grams })
        .from(loadingManifestLines)
        .where(eq(loadingManifestLines.manifestId, manifestId));
      const existingByBatch = new Map(existingRows.map((r) => [r.batchId, r]));
      const maxLineNo = existingRows.reduce((m, r) => (r.lineNo > m ? r.lineNo : m), 0);
      let nextLineNo = maxLineNo + 1;

      await db.transaction(async (tx) => {
        const exec = tx as unknown as DbClient;
        const affectedBatchIds = new Set<string>();
        for (const row of selected) {
          const already = existingByBatch.get(row.batchId);
          const targetGrams = row.onWarehouseGrams;
          const packageCount = packageCountForPart(row.totalGrams, targetGrams, row.linePackageCount);
          if (already) {
            if (targetGrams > already.grams) {
              await exec
                .update(loadingManifestLines)
                .set({ grams: targetGrams, packageCount })
                .where(and(eq(loadingManifestLines.manifestId, manifestId), eq(loadingManifestLines.batchId, row.batchId)));
              affectedBatchIds.add(row.batchId);
            }
          } else {
            await exec.insert(loadingManifestLines).values({
              manifestId,
              batchId: row.batchId,
              lineNo: nextLineNo++,
              grams: targetGrams,
              packageCount,
            });
            affectedBatchIds.add(row.batchId);
          }
          if (row.destination !== manifest.destinationCode) {
            await exec.update(batches).set({ destination: manifest.destinationCode }).where(eq(batches.id, row.batchId));
          }
        }

        if (assignedTripId && tripRead && affectedBatchIds.size > 0) {
          const batchRepo = new DrizzleBatchRepository(exec);
          const shipRepo = new DrizzleTripShipmentRepository(exec);
          const shipUse = new ShipToTripUseCase(batchRepo, tripRead, shipRepo, undefined);

          for (const batchId of affectedBatchIds) {
            const [line] = await exec
              .select({
                grams: loadingManifestLines.grams,
                packageCount: loadingManifestLines.packageCount,
              })
              .from(loadingManifestLines)
              .where(and(eq(loadingManifestLines.manifestId, manifestId), eq(loadingManifestLines.batchId, batchId)))
              .limit(1);
            if (!line) {
              continue;
            }
            const ledger = await shipRepo.totalGramsForTripAndBatch(assignedTripId, batchId);
            const [linePkgAgg] = await exec
              .select({
                totalPackageCount: sql<bigint>`coalesce(sum(${tripBatchShipments.packageCount}), 0::bigint)`,
              })
              .from(tripBatchShipments)
              .where(and(eq(tripBatchShipments.tripId, assignedTripId), eq(tripBatchShipments.batchId, batchId)));
            const [br] = await exec
              .select({
                onWarehouseGrams: batches.onWarehouseGrams,
                inTransitGrams: batches.inTransitGrams,
              })
              .from(batches)
              .where(eq(batches.id, batchId))
              .limit(1);
            const plan = planLoadingManifestAssignTripShipment({
              lineGrams: toBigIntOrZero(line.grams),
              linePackageCount: toNullableBigInt(line.packageCount),
              ledgerGramsForTripBatch: ledger,
              ledgerPackageCountForTripBatch: toBigIntOrZero(linePkgAgg?.totalPackageCount),
              onWarehouseGrams: br?.onWarehouseGrams ?? 0n,
              inTransitGrams: br?.inTransitGrams ?? 0n,
            });
            if (plan.kind === "none") {
              continue;
            }
            if (plan.kind === "ledger_append_in_transit") {
              await shipRepo.append({
                id: randomUUID(),
                tripId: assignedTripId,
                batchId,
                grams: plan.grams,
                packageCount: plan.packageCount,
              });
              continue;
            }
            const kg = Number(plan.grams) / 1000;
            await shipUse.execute({
              batchId,
              tripId: assignedTripId,
              kg,
              packageCount: plan.packageCount == null ? undefined : Number(plan.packageCount),
            });
          }
        }
      });

      return reply.send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/loading-manifests/:manifestId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const { manifestId } = z.object({ manifestId: z.string().min(1) }).parse(req.params);
        await deleteLoadingManifest.execute(manifestId);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.patch(
    "/loading-manifests/:manifestId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const { manifestId } = z.object({ manifestId: z.string().min(1) }).parse(req.params);
        const body = updateLoadingManifestHeaderBodySchema.parse(req.body);
        await updateLoadingManifestHeader.execute(manifestId, body);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
