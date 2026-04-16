import type { FastifyInstance } from "fastify";
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
import type { SellFromTripTransactionRunner } from "../application/sale/sell-from-trip.use-case.js";
import type { RecordTripShortageTransactionRunner } from "../application/trip/record-trip-shortage.use-case.js";
import { RecordTripShortageUseCase } from "../application/trip/record-trip-shortage.use-case.js";
import type { ShipToTripTransactionRunner } from "../application/trip/ship-to-trip.use-case.js";

import { sendMappedError } from "./map-http-error.js";

const createBatchBodySchema = z.object({
  id: z.string().min(1),
  purchaseId: z.string().min(1),
  totalKg: z.number().finite().positive(),
  pricePerKg: z.number().finite().nonnegative(),
  distribution: z.enum(["awaiting_receipt", "on_hand"]),
});

const receiveBodySchema = z.object({
  kg: z.number().finite().positive(),
});

const shipBodySchema = z.object({
  kg: z.number().finite().positive(),
  tripId: z.string().min(1),
});

const sellBodySchema = z
  .object({
    tripId: z.string().min(1),
    kg: z.number().finite().positive(),
    saleId: z.string().min(1),
    pricePerKg: z.number().finite().nonnegative(),
    /** По умолчанию `cash` — вся выручка наличными. */
    paymentKind: z.enum(["cash", "debt", "mixed"]).optional(),
    /** При `mixed`: сколько копеек выручки — нал (строка цифр или целое). */
    cashKopecksMixed: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentKind === "mixed" && data.cashKopecksMixed === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cashKopecksMixed обязателен при paymentKind=mixed",
      });
    }
  });

const recordTripShortageBodySchema = z.object({
  tripId: z.string().min(1),
  kg: z.number().finite().positive(),
  reason: z.string().min(1),
});

export function registerBatchRoutes(
  app: FastifyInstance,
  batches: BatchRepository,
  trips: TripRepository,
  shipments: TripShipmentRepository,
  sales: TripSaleRepository,
  shortages: TripShortageRepository,
  runShipInTransaction?: ShipToTripTransactionRunner,
  runSellInTransaction?: SellFromTripTransactionRunner,
  runRecordTripShortageInTransaction?: RecordTripShortageTransactionRunner,
): void {
  const createPurchase = new CreatePurchaseUseCase(batches);
  const receive = new ReceiveOnWarehouseUseCase(batches);
  const ship = new ShipToTripUseCase(batches, trips, shipments, runShipInTransaction);
  const sell = new SellFromTripUseCase(batches, trips, shipments, sales, shortages, runSellInTransaction);
  const recordShortage = new RecordTripShortageUseCase(
    batches,
    trips,
    shipments,
    sales,
    shortages,
    runRecordTripShortageInTransaction,
  );

  app.post("/batches", async (req, reply) => {
    try {
      const body = createBatchBodySchema.parse(req.body);
      await createPurchase.execute(body);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/receive-on-warehouse", async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = receiveBodySchema.parse(req.body);
      await receive.execute({ batchId: params.batchId, kg: body.kg });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/ship-to-trip", async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = shipBodySchema.parse(req.body);
      await ship.execute({
        batchId: params.batchId,
        kg: body.kg,
        tripId: body.tripId,
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/sell-from-trip", async (req, reply) => {
    try {
      const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
      const body = sellBodySchema.parse(req.body);
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
      });
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/batches/:batchId/record-trip-shortage", async (req, reply) => {
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
