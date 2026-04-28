import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { DbClient } from "../db/client.js";
import {
  createBatchBodySchema,
  receiveBodySchema,
  recordTripShortageBodySchema,
  sellFromTripBodySchema,
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
} from "../db/schema.js";
import { gramsToKg } from "../infrastructure/persistence/batch-mass.js";

import { CreatePurchaseUseCase } from "../application/purchase/create-purchase.use-case.js";
import { SellFromTripUseCase } from "../application/sale/sell-from-trip.use-case.js";
import { ShipToTripUseCase } from "../application/trip/ship-to-trip.use-case.js";
import { ReceiveOnWarehouseUseCase } from "../application/warehouse/receive-on-warehouse.use-case.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import type { CounterpartyRepository } from "../application/ports/counterparty-repository.port.js";
import type { SellFromTripTransactionRunner } from "../application/sale/sell-from-trip.use-case.js";
import type { RecordTripShortageTransactionRunner } from "../application/trip/record-trip-shortage.use-case.js";
import { RecordTripShortageUseCase } from "../application/trip/record-trip-shortage.use-case.js";
import type { ShipToTripTransactionRunner } from "../application/trip/ship-to-trip.use-case.js";

import { warehouseReadScopeIds } from "../auth/warehouse-scope.js";
import { filterBatchJsonByWarehouseScope } from "./batch-json-warehouse-filter.js";
import { listBatchesForHttp } from "./batch-list-http.js";
import { assertActiveShipDestination } from "./register-ship-destination-routes.js";
import { sendMappedError } from "./map-http-error.js";
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
  const sell = new SellFromTripUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    counterparties,
    runSellInTransaction,
  );
  const recordShortage = new RecordTripShortageUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    runRecordTripShortageInTransaction,
  );

  app.get("/batches", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const payload = await listBatchesForHttp(batches, db);
      const user = req.user as JwtRequestUser | undefined;
      return reply.send({ batches: batchesPayloadForUser(payload, user) });
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
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      await sell.execute({
        batchId: params.batchId,
        tripId: body.tripId,
        kg: body.kg,
        saleId: body.saleId,
        pricePerKg: body.pricePerKg,
        paymentKind: body.paymentKind,
        cashKopecksMixed,
        clientLabel: body.clientLabel,
        counterpartyId: body.counterpartyId,
        recordedByUserId: u?.sub,
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
        const q = z.object({ purchaseDocumentId: z.string().min(1) });
        const { purchaseDocumentId } = q.parse(req.query);
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
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
