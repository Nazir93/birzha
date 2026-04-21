import type { FastifyInstance } from "fastify";

import type { DbClient } from "../db/client.js";
import {
  createBatchBodySchema,
  receiveBodySchema,
  recordTripShortageBodySchema,
  sellFromTripBodySchema,
  shipBodySchema,
} from "@birzha/contracts";
import { z } from "zod";

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

import { listBatchesForHttp } from "./batch-list-http.js";
import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

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

  app.get("/batches", { ...withPreHandlers(routeAuth.dataRead) }, async (_req, reply) => {
    try {
      const payload = await listBatchesForHttp(batches, db);
      return reply.send({ batches: payload });
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
}
