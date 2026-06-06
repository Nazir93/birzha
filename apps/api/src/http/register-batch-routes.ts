import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { DbClient } from "../db/client.js";
import {
  createBatchBodySchema,
  receiveBodySchema,
  recordTripShortageBodySchema,
  sellFromTripBodySchema,
  updateTripSaleBodySchema,
  shipBodySchema,
  postWarehouseWriteOffBodySchema,
  updateBatchAllocationBodySchema,
} from "@birzha/contracts";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { RecordWarehouseWriteOffUseCase } from "../application/batch/record-warehouse-write-off.use-case.js";
import {
  batchWarehouseWriteOffs,
  batches as batchesTable,
  productGrades,
  purchaseDocumentLines,
  purchaseDocuments,
  warehouses as warehousesTable,
} from "../db/schema.js";
import { gramsToKg } from "../infrastructure/persistence/batch-mass.js";
import { DrizzlePurchaseLinePackageMetaRepository } from "../infrastructure/persistence/drizzle-purchase-line-package-meta.js";
import { NullPurchaseLinePackageMetaPort } from "../infrastructure/persistence/null-purchase-line-package-meta.js";

import { CreatePurchaseUseCase } from "../application/purchase/create-purchase.use-case.js";
import { DeleteTripSaleLineUseCase } from "../application/sale/delete-trip-sale-line.use-case.js";
import { SellFromTripUseCase } from "../application/sale/sell-from-trip.use-case.js";
import { UpdateTripSaleLineUseCase } from "../application/sale/update-trip-sale-line.use-case.js";
import { ShipToTripUseCase } from "../application/trip/ship-to-trip.use-case.js";
import { ReceiveOnWarehouseUseCase } from "../application/warehouse/receive-on-warehouse.use-case.js";
import type { BatchListFilter, BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import type { CounterpartyRepository } from "../application/ports/counterparty-repository.port.js";
import type { WholesalerRepository } from "../application/ports/wholesaler-repository.port.js";
import type { SellFromTripTransactionRunner } from "../application/sale/sell-from-trip.use-case.js";
import type { RecordTripShortageTransactionRunner } from "../application/trip/record-trip-shortage.use-case.js";
import { RecordTripShortageUseCase } from "../application/trip/record-trip-shortage.use-case.js";
import type { ShipToTripTransactionRunner } from "../application/trip/ship-to-trip.use-case.js";
import { assertTripAllowsWarehouseLoading } from "../application/trip/assert-trip-warehouse-loading.js";

import { isGlobalSellerOnly, tripVisibleToFieldSeller } from "../auth/seller-scope.js";
import { warehouseReadScopeIds } from "../auth/warehouse-scope.js";
import { filterBatchJsonByWarehouseScope } from "./batch-json-warehouse-filter.js";
import { listBatchesForHttp } from "./batch-list-http.js";
import { assertActiveShipDestination } from "./register-ship-destination-routes.js";
import { sendMappedError } from "./map-http-error.js";
import { tripSaleLineToJson } from "./trip-sale-line-serialize.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtRequestUser = { sub: string; login: string; roles: AuthRoleGrant[] };

function batchesPayloadForUser(payload: Awaited<ReturnType<typeof listBatchesForHttp>>, user: JwtRequestUser | undefined) {
  const scope = user ? warehouseReadScopeIds(user) : null;
  if (scope && scope.size > 0) {
    return filterBatchJsonByWarehouseScope(payload, scope);
  }
  return payload;
}

export function registerBatchRoutes(
  app: FastifyInstance,
  batches: BatchRepository,
  trips: TripRepository,
  shipments: TripShipmentRepository,
  sales: TripSaleRepository,
  shortages: TripShortageRepository,
  counterparties: CounterpartyRepository,
  wholesalers: WholesalerRepository,
  routeAuth: BusinessRouteAuth,
  runShipInTransaction?: ShipToTripTransactionRunner,
  runSellInTransaction?: SellFromTripTransactionRunner,
  runRecordTripShortageInTransaction?: RecordTripShortageTransactionRunner,
  db: DbClient | null = null,
  recordWarehouseWriteOff: RecordWarehouseWriteOffUseCase | null = null,
): void {
  const createPurchase = new CreatePurchaseUseCase(batches);
  const receive = new ReceiveOnWarehouseUseCase(batches);
  const ship = new ShipToTripUseCase(batches, trips, shipments, runShipInTransaction);
  const purchaseLinePackages = db
    ? new DrizzlePurchaseLinePackageMetaRepository(db)
    : new NullPurchaseLinePackageMetaPort();
  const sell = new SellFromTripUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    counterparties,
    wholesalers,
    purchaseLinePackages,
    runSellInTransaction,
  );
  const updateTripSale = new UpdateTripSaleLineUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    counterparties,
    wholesalers,
    purchaseLinePackages,
    runSellInTransaction,
  );
  const deleteTripSale = new DeleteTripSaleLineUseCase(batches, trips, sales, runSellInTransaction);
  const recordShortage = new RecordTripShortageUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    runRecordTripShortageInTransaction,
  );

  const batchesListQuerySchema = z.object({
    ids: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    warehouseId: z.string().min(1).max(200).optional(),
    stockOnly: z
      .enum(["1", "true", "0", "false"])
      .optional()
      .transform((v) => v === "1" || v === "true"),
  });

  app.get("/batches", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const raw = req.query as Record<string, string | undefined>;
      const parsed = batchesListQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_query", issues: parsed.error.flatten() });
      }
      const d = parsed.data;
      const ids =
        d.ids
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? undefined;

      let filter: BatchListFilter;
      let listMeta: { limit: number; offset: number; hasMore: boolean; totalCount?: number } | undefined;

      if (ids && ids.length > 0) {
        filter = { ids };
      } else {
        const limit = d.limit ?? 100;
        const offset = d.offset ?? 0;
        filter = {
          search: d.search?.trim() || undefined,
          limit,
          offset,
          warehouseId: d.warehouseId?.trim() || undefined,
          stockOnly: d.stockOnly || undefined,
        };
        listMeta = { limit, offset, hasMore: false };
      }

      let payload = await listBatchesForHttp(batches, db, filter);
      if (listMeta && !filter.ids) {
        listMeta = {
          ...listMeta,
          hasMore: payload.length === (filter.limit ?? 100),
        };
      }
      const user = req.user as JwtRequestUser | undefined;
      const batchesOut = batchesPayloadForUser(payload, user);
      if (listMeta) {
        return reply.send({ batches: batchesOut, listMeta });
      }
      return reply.send({ batches: batchesOut });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches", { ...withPreHandlers(routeAuth.batchCreate) }, async (req, reply) => {
    try {
      const body = createBatchBodySchema.parse(req.body);
      await createPurchase.execute(body);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/receive-on-warehouse", { ...withPreHandlers(routeAuth.receive) }, async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = receiveBodySchema.parse(req.body);
      await receive.execute({ batchId: params.batchId, kg: body.kg });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/ship-to-trip", { ...withPreHandlers(routeAuth.ship) }, async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = shipBodySchema.parse(req.body);
      if (db) {
        const [batchRow] = await db
          .select({ warehouseId: batchesTable.warehouseId })
          .from(batchesTable)
          .where(eq(batchesTable.id, params.batchId))
          .limit(1);
        if (batchRow) {
          await assertTripAllowsWarehouseLoading(db, trips, {
            tripId: body.tripId,
            warehouseId: batchRow.warehouseId,
          });
        }
      }
      await ship.execute({
        batchId: params.batchId,
        kg: body.kg,
        tripId: body.tripId,
        packageCount: body.packageCount,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  /** Чтение журнала — как отчёт по рейсу (бухгалтер, логист); правки строк — `routeAuth.sell`. */
  app.get("/trips/:tripId/sale-lines", { ...withPreHandlers(routeAuth.tripReportRead) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const trip = await trips.findById(tripId);
      if (!trip) {
        return reply.code(404).send({ error: "trip_not_found", tripId });
      }
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (u && isGlobalSellerOnly(u.roles) && !tripVisibleToFieldSeller(trip, u.sub)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const onlyMine = u && isGlobalSellerOnly(u.roles) ? u.sub : undefined;
      const lines = await sales.listLinesByTripId(
        tripId,
        onlyMine ? { onlyRecordedByUserId: onlyMine } : undefined,
      );
      return reply.send({
        trip: { id: trip.getId(), status: trip.getStatus() },
        lines: lines.map(tripSaleLineToJson),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.patch("/trip-sales/:lineId", { ...withPreHandlers(routeAuth.sell) }, async (req, reply) => {
    try {
      const { lineId } = z.object({ lineId: z.string().min(1) }).parse(req.params);
      const body = updateTripSaleBodySchema.parse(req.body);
      const cashKopecksMixed =
        body.cashKopecksMixed === undefined
          ? undefined
          : typeof body.cashKopecksMixed === "string"
            ? BigInt(body.cashKopecksMixed)
            : BigInt(body.cashKopecksMixed);
      const cardTransferKopecks =
        body.cardTransferKopecks === undefined
          ? undefined
          : typeof body.cardTransferKopecks === "string"
            ? BigInt(body.cardTransferKopecks)
            : BigInt(body.cardTransferKopecks);
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      await updateTripSale.execute({
        lineId,
        kg: body.kg,
        pricePerKg: body.pricePerKg,
        saleChannel: body.saleChannel,
        paymentKind: body.paymentKind,
        cashKopecksMixed,
        cardTransferKopecks,
        clientLabel: body.clientLabel,
        counterpartyId: body.counterpartyId,
        wholesaleBuyerId: body.wholesaleBuyerId,
        packageCount: body.packageCount,
        editorUserId: u?.sub,
        editorRoles: u?.roles,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete("/trip-sales/:lineId", { ...withPreHandlers(routeAuth.sell) }, async (req, reply) => {
    try {
      const { lineId } = z.object({ lineId: z.string().min(1) }).parse(req.params);
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      await deleteTripSale.execute({
        lineId,
        editorUserId: u?.sub,
        editorRoles: u?.roles,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/sell-from-trip", { ...withPreHandlers(routeAuth.sell) }, async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = sellFromTripBodySchema.parse(req.body);
      const cashKopecksMixed =
        body.cashKopecksMixed === undefined
          ? undefined
          : typeof body.cashKopecksMixed === "string"
            ? BigInt(body.cashKopecksMixed)
            : BigInt(body.cashKopecksMixed);
      const cardTransferKopecks =
        body.cardTransferKopecks === undefined
          ? undefined
          : typeof body.cardTransferKopecks === "string"
            ? BigInt(body.cardTransferKopecks)
            : BigInt(body.cardTransferKopecks);
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (u && isGlobalSellerOnly(u.roles)) {
        const trip = await trips.findById(body.tripId);
        if (!trip) {
          return reply.code(404).send({ error: "trip_not_found", tripId: body.tripId });
        }
        if (!tripVisibleToFieldSeller(trip, u.sub)) {
          return reply.code(403).send({ error: "forbidden" });
        }
      }
      await sell.execute({
        batchId: params.batchId,
        tripId: body.tripId,
        kg: body.kg,
        saleId: body.saleId,
        pricePerKg: body.pricePerKg,
        saleChannel: body.saleChannel,
        paymentKind: body.paymentKind,
        cashKopecksMixed,
        cardTransferKopecks,
        clientLabel: body.clientLabel,
        counterpartyId: body.counterpartyId,
        wholesaleBuyerId: body.wholesaleBuyerId,
        recordedByUserId: u?.sub,
        packageCount: body.packageCount,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/record-trip-shortage", { ...withPreHandlers(routeAuth.shortage) }, async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = recordTripShortageBodySchema.parse(req.body);
      await recordShortage.execute({
        batchId: params.batchId,
        tripId: body.tripId,
        kg: body.kg,
        reason: body.reason,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.patch(
    "/batches/:batchId/allocation",
    { ...withPreHandlers(routeAuth.batchCreate) },
    async (req, reply) => {
      if (!db) {
        return reply.code(503).send({ error: "allocation_requires_postgres" });
      }
      try {
        const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
        const body = updateBatchAllocationBodySchema.parse(req.body);
        const [row] = await db
          .select({ id: batchesTable.id })
          .from(batchesTable)
          .where(eq(batchesTable.id, params.batchId))
          .limit(1);
        if (!row) {
          return reply.code(404).send({ error: "batch_not_found" });
        }
        if (body.destination != null) {
          const ok = await assertActiveShipDestination(db, body.destination);
          if (!ok) {
            return reply.code(400).send({ error: "invalid_ship_destination" });
          }
        }
        const patch: { qualityTier?: string | null; destination?: string | null } = {};
        if (body.qualityTier !== undefined) {
          patch.qualityTier = body.qualityTier;
        }
        if (body.destination !== undefined) {
          patch.destination = body.destination;
        }
        await db.update(batchesTable).set(patch).where(eq(batchesTable.id, params.batchId));
        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.post(
    "/batches/:batchId/warehouse-write-off",
    { ...withPreHandlers(routeAuth.batchCreate) },
    async (req, reply) => {
      if (!db || !recordWarehouseWriteOff) {
        return reply.code(503).send({ error: "warehouse_write_off_requires_postgres" });
      }
      try {
        const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
        const body = postWarehouseWriteOffBodySchema.parse(req.body);
        const [row] = await db
          .select({ id: batchesTable.id })
          .from(batchesTable)
          .where(eq(batchesTable.id, params.batchId))
          .limit(1);
        if (!row) {
          return reply.code(404).send({ error: "batch_not_found" });
        }
        await recordWarehouseWriteOff.execute({
          batchId: params.batchId,
          kg: body.kg,
          reason: "quality_reject",
        });
        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.get(
    "/warehouse-write-offs",
    { ...withPreHandlers(routeAuth.dataRead) },
    async (req, reply) => {
      if (!db) {
        return reply.code(503).send({ error: "warehouse_write_off_ledger_requires_postgres" });
      }
      try {
        const q = z.object({
          purchaseDocumentId: z.string().min(1).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
          warehouseId: z.string().min(1).optional(),
        });
        const parsed = q.parse(req.query);

        if (parsed.purchaseDocumentId) {
          const purchaseDocumentId = parsed.purchaseDocumentId;
          const rows = await db
            .select({
              id: batchWarehouseWriteOffs.id,
              batchId: batchWarehouseWriteOffs.batchId,
              grams: batchWarehouseWriteOffs.grams,
              createdAt: batchWarehouseWriteOffs.createdAt,
              documentId: purchaseDocuments.id,
              documentNumber: purchaseDocuments.documentNumber,
              productGradeCode: productGrades.code,
            })
            .from(batchWarehouseWriteOffs)
            .innerJoin(
              purchaseDocumentLines,
              eq(batchWarehouseWriteOffs.batchId, purchaseDocumentLines.batchId),
            )
            .innerJoin(
              purchaseDocuments,
              eq(purchaseDocumentLines.documentId, purchaseDocuments.id),
            )
            .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
            .where(
              and(
                eq(purchaseDocuments.id, purchaseDocumentId),
                eq(batchWarehouseWriteOffs.reason, "quality_reject"),
              ),
            )
            .orderBy(desc(batchWarehouseWriteOffs.createdAt));
          return reply.send({
            documentId: purchaseDocumentId,
            totalKg: rows.reduce((a, r) => a + gramsToKg(r.grams), 0),
            lines: rows.map((r) => ({
              id: r.id,
              batchId: r.batchId,
              kg: gramsToKg(r.grams),
              createdAt: r.createdAt.toISOString(),
              productGradeCode: r.productGradeCode,
            })),
          });
        }

        const limit = parsed.limit ?? 200;
        const conditions = [eq(batchWarehouseWriteOffs.reason, "quality_reject")];
        if (parsed.warehouseId) {
          conditions.push(eq(batchesTable.warehouseId, parsed.warehouseId));
        }
        const rows = await db
          .select({
            id: batchWarehouseWriteOffs.id,
            batchId: batchWarehouseWriteOffs.batchId,
            grams: batchWarehouseWriteOffs.grams,
            createdAt: batchWarehouseWriteOffs.createdAt,
            purchaseDocumentId: purchaseDocuments.id,
            documentNumber: purchaseDocuments.documentNumber,
            productGradeCode: productGrades.code,
            warehouseName: warehousesTable.name,
            warehouseCode: warehousesTable.code,
          })
          .from(batchWarehouseWriteOffs)
          .innerJoin(batchesTable, eq(batchWarehouseWriteOffs.batchId, batchesTable.id))
          .leftJoin(warehousesTable, eq(batchesTable.warehouseId, warehousesTable.id))
          .innerJoin(
            purchaseDocumentLines,
            eq(batchWarehouseWriteOffs.batchId, purchaseDocumentLines.batchId),
          )
          .innerJoin(
            purchaseDocuments,
            eq(purchaseDocumentLines.documentId, purchaseDocuments.id),
          )
          .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
          .where(and(...conditions))
          .orderBy(desc(batchWarehouseWriteOffs.createdAt))
          .limit(limit);

        return reply.send({
          ledger: "recent",
          warehouseIdFilter: parsed.warehouseId ?? null,
          limit,
          totalKg: rows.reduce((a, r) => a + gramsToKg(r.grams), 0),
          lines: rows.map((r) => ({
            id: r.id,
            batchId: r.batchId,
            kg: gramsToKg(r.grams),
            createdAt: r.createdAt.toISOString(),
            purchaseDocumentId: r.purchaseDocumentId,
            documentNumber: r.documentNumber,
            productGradeCode: r.productGradeCode,
            warehouseName: r.warehouseName,
            warehouseCode: r.warehouseCode,
          })),
        });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
