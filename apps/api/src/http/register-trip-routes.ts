import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { TripNotFoundError } from "../application/errors.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import { CloseTripUseCase } from "../application/trip/close-trip.use-case.js";
import { CreateTripUseCase } from "../application/trip/create-trip.use-case.js";
import { GetTripReportUseCase } from "../application/trip/get-trip-report.use-case.js";

import { sendMappedError } from "./map-http-error.js";
import { ledgerAggregateToJson, saleLedgerAggregateToJson, tripFinancialsToJson } from "./trip-report-serialize.js";
import { tripToJson } from "./trip-serialize.js";

const createTripBodySchema = z.object({
  id: z.string().min(1),
  tripNumber: z.string().min(1),
});

export function registerTripRoutes(
  app: FastifyInstance,
  trips: TripRepository,
  shipments: TripShipmentRepository,
  sales: TripSaleRepository,
  shortages: TripShortageRepository,
  batches: BatchRepository,
): void {
  const createTrip = new CreateTripUseCase(trips);
  const closeTrip = new CloseTripUseCase(trips);
  const tripReport = new GetTripReportUseCase(trips, shipments, sales, shortages, batches);

  app.get("/trips", async (_req, reply) => {
    try {
      const list = await trips.list();
      return reply.send({ trips: list.map(tripToJson) });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/:tripId/shipment-report", async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const { trip, shipment, sales: saleAgg, shortage: shortageAgg, financials } = await tripReport.execute(tripId);
      return reply.send({
        trip: tripToJson(trip),
        shipment: ledgerAggregateToJson(shipment),
        sales: saleLedgerAggregateToJson(saleAgg),
        shortage: ledgerAggregateToJson(shortageAgg),
        financials: tripFinancialsToJson(financials),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/:tripId", async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const trip = await trips.findById(tripId);
      if (!trip) {
        throw new TripNotFoundError(tripId);
      }
      return reply.send({ trip: tripToJson(trip) });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips", async (req, reply) => {
    try {
      const body = createTripBodySchema.parse(req.body);
      await createTrip.execute(body);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips/:tripId/close", async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      await closeTrip.execute(tripId);
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
